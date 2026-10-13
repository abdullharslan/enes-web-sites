import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { assertLocalDatabase } from "@/db/reset";

/*
 * DESTRUCTIVE (local only): replaces the database contents with a backup and
 * unpacks the matching media archive. Usage: npm run db:restore -- backups/<file>.dump
 */

const dumpFile = process.argv[2];
if (!dumpFile || !dumpFile.endsWith(".dump") || !existsSync(dumpFile)) {
  console.error("Usage: npm run db:restore -- backups/<database>_<stamp>.dump");
  process.exit(1);
}

const url = new URL(assertLocalDatabase(process.env.DATABASE_URL));
const database = url.pathname.slice(1);
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
if (restore.status !== 0) {
  console.error(restore.stderr.toString());
  process.exit(1);
}

const stamp = dumpFile.match(/_(\d{8}-\d{6})\.dump$/)?.[1];
const mediaFile = stamp ? `backups/media_${stamp}.tar.gz` : undefined;
if (mediaFile && existsSync(mediaFile)) {
  const mediaRoot = process.env.MEDIA_ROOT ?? "storage/media";
  mkdirSync(mediaRoot, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", mediaFile, "-C", mediaRoot]);
  if (tar.status !== 0) {
    console.error(tar.stderr.toString());
    process.exit(1);
  }
}
console.log(
  `restored ${database} from ${dumpFile}${mediaFile && existsSync(mediaFile) ? ` + ${mediaFile}` : ""}`,
);
