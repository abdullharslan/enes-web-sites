import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { assertLocalDatabase } from "@/db/reset";

/*
 * Consistent backup of the database (pg_dump custom format), the public media
 * files and the private files (inquiry photos). All are needed to restore:
 * rows reference files by key.
 */

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+/, "")
  .replace("T", "-");
// BACKUP_DIR: only the round-trip test points this elsewhere.
const dir = process.env.BACKUP_DIR ?? "backups";
mkdirSync(dir, { recursive: true });

const url = new URL(assertLocalDatabase(process.env.DATABASE_URL));
const database = url.pathname.slice(1);
const dumpFile = `${dir}/${database}_${stamp}.dump`;
const ARCHIVES = [
  {
    root: process.env.MEDIA_ROOT ?? "storage/media",
    file: `${dir}/media_${stamp}.tar.gz`,
  },
  {
    root: process.env.PRIVATE_STORAGE_ROOT ?? "storage/private",
    file: `${dir}/private_${stamp}.tar.gz`,
  },
];

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

const written = [dumpFile];
for (const { root, file } of ARCHIVES) {
  if (!existsSync(root)) continue;
  const tar = spawnSync("tar", ["-czf", file, "-C", root, "."]);
  spawnSync("chmod", ["600", file]);
  if (tar.status !== 0) {
    console.error(tar.stderr.toString());
    process.exit(1);
  }
  written.push(file);
}
console.log(`backup written: ${written.join(" + ")}`);
