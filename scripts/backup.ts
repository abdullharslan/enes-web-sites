import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { assertLocalDatabase } from "@/db/reset";
import { backupDirectory, rotateBackups } from "./backup-rotation";

/*
 * Consistent backup of the database (pg_dump custom format), the public media
 * files and the private files (inquiry photos). All are needed to restore:
 * rows reference files by key. A set always has all three files, and they get
 * their final names only once the whole set is written, so whatever carries
 * such a name is finished (the rotation relies on it).
 */

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+/, "")
  .replace("T", "-");
const dir = backupDirectory();
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
const FILES = [dumpFile, ...ARCHIVES.map(({ file }) => file)];
const partial = (file: string) => `${file}.partial`;

function fail(detail: string): never {
  for (const file of FILES) rmSync(partial(file), { force: true });
  console.error(detail);
  process.exit(1);
}

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
if (dump.status !== 0) fail(dump.stderr.toString());
// Backups contain password hashes and personal data: owner-only permissions.
writeFileSync(partial(dumpFile), dump.stdout, { mode: 0o600 });

for (const { root, file } of ARCHIVES) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const tar = spawnSync("tar", ["-czf", partial(file), "-C", root, "."]);
  spawnSync("chmod", ["600", partial(file)]);
  if (tar.status !== 0) fail(tar.stderr.toString());
}
for (const file of FILES) renameSync(partial(file), file);
console.log(`backup written: ${FILES.join(" + ")}`);

// Only after a finished backup, so the set just written counts as the newest.
rotateBackups(dir, database)
  .then(({ sets, files }) =>
    console.log(`backups rotated: ${sets} old sets deleted (${files} files)`),
  )
  .catch((error: unknown) => {
    console.error(
      "Backup rotation failed",
      error instanceof Error ? error.name : "unknown",
    );
    process.exitCode = 1;
  });
