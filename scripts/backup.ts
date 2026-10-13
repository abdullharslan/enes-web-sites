import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { assertLocalDatabase } from "@/db/reset";

/*
 * Consistent backup of the database (pg_dump custom format) and the media
 * files. Both are needed to restore: rows reference files by key.
 */

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+/, "")
  .replace("T", "-");
const dir = "backups";
mkdirSync(dir, { recursive: true });

const url = new URL(assertLocalDatabase(process.env.DATABASE_URL));
const database = url.pathname.slice(1);
const dumpFile = `${dir}/${database}_${stamp}.dump`;
const mediaFile = `${dir}/media_${stamp}.tar.gz`;

const dump = spawnSync(
  "docker-compose",
  [
    "--env-file",
    ".env.local",
    "exec",
    "-T",
    "postgres",
    "pg_dump",
    "-U",
    decodeURIComponent(url.username),
    "-d",
    database,
    "-Fc",
  ],
  { maxBuffer: 1024 * 1024 * 1024 },
);
if (dump.status !== 0) {
  console.error(dump.stderr.toString());
  process.exit(1);
}
// Backups contain password hashes and personal data: owner-only permissions.
createWriteStream(dumpFile, { mode: 0o600 }).end(dump.stdout);

const mediaRoot = process.env.MEDIA_ROOT ?? "storage/media";
if (existsSync(mediaRoot)) {
  const tar = spawnSync("tar", ["-czf", mediaFile, "-C", mediaRoot, "."]);
  spawnSync("chmod", ["600", mediaFile]);
  if (tar.status !== 0) {
    console.error(tar.stderr.toString());
    process.exit(1);
  }
}
console.log(
  `backup written: ${dumpFile}${existsSync(mediaFile) ? ` + ${mediaFile}` : ""}`,
);
