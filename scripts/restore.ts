import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { connect } from "@/db/connection";
import { runMigrations } from "@/db/migrate";
import { assertLocalDatabase } from "@/db/reset";
import {
  ERASURE_LEDGER_FILE,
  applyErasureLedger,
  mergeErasureLedger,
  readErasureLedger,
} from "@/lib/server/inquiries/erasure";
import { applyRetention } from "@/lib/server/inquiries/retention";

/*
 * DESTRUCTIVE (local only): replaces the database contents with a backup and
 * unpacks the matching media and private-file archives, brings the schema up to
 * date, then erases again everything the ledger lists and applies retention, so
 * deleted data does not return. The live ledger only ever grows: it takes on
 * what the archive's copy knows and is never replaced by it.
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

/** Brings what the archive's ledger knows into the live one; returns torn lines seen there. */
async function mergeArchivedLedger(
  archive: string,
  members: string[],
  privateRoot: string,
): Promise<number> {
  const member = members.find(
    (name) => name.replace(/^\.\//, "") === ERASURE_LEDGER_FILE,
  );
  if (!member) return 0;
  const temp = mkdtempSync(join(tmpdir(), "mv-archived-ledger-"));
  try {
    const tar = spawnSync("tar", ["-xzf", archive, "-C", temp, member]);
    if (tar.status !== 0) {
      throw new Error(`Archive ${archive} is unreadable. Nothing was changed.`);
    }
    return (await mergeErasureLedger(privateRoot, temp)).tornLines;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function unpack(file: string, root: string): void {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  // The archive's ledger was merged above and must not replace the live one.
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
  )
    .filter(({ file }) => existsSync(file))
    .map((archive) => ({ ...archive, members: listArchive(archive.file) }));

  const dump = readFileSync(dumpFile);
  if (pgRestore(dump, ["--list"]) !== 0) {
    throw new Error(`Backup ${dumpFile} is unreadable. Nothing was changed.`);
  }

  for (const { root, file, members } of archives) {
    if (root === privateRoot) {
      tornLines += await mergeArchivedLedger(file, members, privateRoot);
    }
  }

  // From here on the database may be replaced: whatever goes wrong, the ledger
  // is applied before this script ends, and the first error is the one reported.
  let replaceError: unknown;
  const restored = [dumpFile];
  try {
    const status = pgRestore(dump, [
      "--clean",
      "--if-exists",
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
