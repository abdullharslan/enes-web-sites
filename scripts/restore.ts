import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { connect } from "@/db/connection";
import { assertLocalDatabase } from "@/db/reset";
import {
  ERASURE_LEDGER_FILE,
  applyErasureLedger,
  readErasureLedger,
} from "@/lib/server/inquiries/erasure";
import { applyRetention } from "@/lib/server/inquiries/retention";

/*
 * DESTRUCTIVE (local only): replaces the database contents with a backup and
 * unpacks the matching media and private-file archives, then erases again what
 * was erased on request after the backup was taken (the ledger stays as it is
 * on disk) and applies retention, so neither kind of deleted data returns.
 * Usage: npm run db:restore -- backups/<file>.dump
 */

async function main(): Promise<void> {
  const dumpFile = process.argv[2];
  if (!dumpFile || !dumpFile.endsWith(".dump") || !existsSync(dumpFile)) {
    throw new Error("Usage: npm run db:restore -- backups/<database>_<stamp>.dump");
  }

  const url = new URL(assertLocalDatabase(process.env.DATABASE_URL));
  const database = url.pathname.slice(1);
  const privateRoot = process.env.PRIVATE_STORAGE_ROOT ?? "storage/private";

  // Before anything is replaced: an unreadable ledger must not cost the current data.
  await readErasureLedger(privateRoot);

  const restore = spawnSync(
    "docker-compose",
    [
      "--env-file",
      ".env.local",
      "exec",
      "-T",
      "postgres",
      "pg_restore",
      "--clean",
      "--if-exists",
      "--no-owner",
      "-U",
      decodeURIComponent(url.username),
      "-d",
      database,
    ],
    { input: readFileSync(dumpFile), maxBuffer: 1024 * 1024 * 1024 },
  );
  if (restore.status !== 0) throw new Error(restore.stderr.toString());

  const stamp = dumpFile.match(/_(\d{8}-\d{6})\.dump$/)?.[1];
  const dir = dirname(dumpFile);
  const ARCHIVES = [
    {
      root: process.env.MEDIA_ROOT ?? "storage/media",
      file: `${dir}/media_${stamp}.tar.gz`,
    },
    { root: privateRoot, file: `${dir}/private_${stamp}.tar.gz` },
  ];
  const restored = [dumpFile];
  for (const { root, file } of stamp ? ARCHIVES : []) {
    if (!existsSync(file)) continue;
    mkdirSync(root, { recursive: true, mode: 0o700 });
    // The archive's ledger is older than the live one and must not replace it.
    const tar = spawnSync("tar", [
      `--exclude=${ERASURE_LEDGER_FILE}`,
      "-xzf",
      file,
      "-C",
      root,
    ]);
    if (tar.status !== 0) throw new Error(tar.stderr.toString());
    restored.push(file);
  }

  const { db, close } = connect(url.href, { max: 1 });
  try {
    const erasures = await applyErasureLedger(db, privateRoot);
    const retention = await applyRetention(db, privateRoot);
    console.log(`restored ${database} from ${restored.join(" + ")}`);
    console.log(
      `erasures: ${erasures.entries} ledger entries, ${erasures.inquiries} inquiries erased again`,
    );
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
    "Restore stopped. If the database was already replaced, erased or expired data may be present: fix the cause and restore again.",
  );
  process.exitCode = 1;
});
