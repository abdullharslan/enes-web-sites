// @vitest-environment node
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rotateBackups } from "@/scripts/backup-rotation";

const DB = "maison_vault";
const NOW = new Date("2026-11-08T12:00:00Z");
const OLD = "20261001-120000"; // 38 days
const OLDER = "20260901-120000";
const RECENT = "20261101-120000";
const JUST_INSIDE = "20261009-120001"; // 29 days 23:59:59
const JUST_OUTSIDE = "20261009-115959"; // 30 days 00:00:01

let base: string;
let dir: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "mv-rotation-"));
  dir = join(base, "backups");
  mkdirSync(dir);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const write = (name: string, content = "data") => writeFileSync(join(dir, name), content);
const names = (stamp: string) => [
  `${DB}_${stamp}.dump`,
  `media_${stamp}.tar.gz`,
  `private_${stamp}.tar.gz`,
];
const writeSet = (stamp: string) => names(stamp).forEach((name) => write(name));
const has = (name: string) => existsSync(join(dir, name));
const rotate = () => rotateBackups(dir, DB, NOW);

describe("rotateBackups", () => {
  it("deletes sets older than 30 days and keeps the newer ones", async () => {
    writeSet(OLDER);
    writeSet(OLD);
    writeSet(JUST_OUTSIDE);
    writeSet(JUST_INSIDE);
    writeSet(RECENT);

    await expect(rotate()).resolves.toEqual({ sets: 3, files: 9 });

    expect(readdirSync(dir).sort()).toEqual(
      [...names(JUST_INSIDE), ...names(RECENT)].sort(),
    );
  });

  it("always keeps the newest complete set, however old it is", async () => {
    writeSet(OLDER);
    writeSet(OLD);

    await expect(rotate()).resolves.toEqual({ sets: 1, files: 3 });

    expect(readdirSync(dir).sort()).toEqual(names(OLD).sort());
  });

  it("deletes nothing while no complete set exists", async () => {
    write(`${DB}_${OLDER}.dump`);
    write(`media_${OLD}.tar.gz`);

    await expect(rotate()).resolves.toEqual({ sets: 0, files: 0 });

    expect(has(`${DB}_${OLDER}.dump`)).toBe(true);
    expect(has(`media_${OLD}.tar.gz`)).toBe(true);
  });

  it("does not count an incomplete newer set as the one to keep", async () => {
    writeSet(OLDER);
    writeSet(OLD);
    write(`${DB}_${RECENT}.dump`);

    await rotate();

    for (const name of names(OLD)) expect(has(name)).toBe(true);
    expect(has(`${DB}_${RECENT}.dump`)).toBe(true);
    for (const name of names(OLDER)) expect(has(name)).toBe(false);
  });

  it("does not count an empty file towards a complete set", async () => {
    writeSet(OLDER);
    writeSet(OLD);
    write(`private_${OLD}.tar.gz`, "");

    await rotate();

    for (const name of names(OLDER)) expect(has(name)).toBe(true);
  });

  it("removes the leftovers of an old incomplete set once a complete one exists", async () => {
    write(`media_${OLDER}.tar.gz`);
    writeSet(RECENT);

    await expect(rotate()).resolves.toEqual({ sets: 1, files: 1 });

    expect(has(`media_${OLDER}.tar.gz`)).toBe(false);
  });

  it("touches nothing but the exact names a backup produces", async () => {
    writeSet(OLD);
    writeSet(RECENT);
    const foreign = [
      `other_db_${OLD}.dump`,
      `${DB}_${OLD}.dump.bak`,
      `copy-of-media_${OLD}.tar.gz`,
      `media_${OLD}.tar`,
      `documents_${OLD}.tar.gz`,
      `media_20261301-120000.tar.gz`, // month 13: not a time backup.ts can write
      `${DB}_${OLD}.dump.partial`,
      "erasure-ledger.jsonl",
      "notes.txt",
    ];
    foreign.forEach((name) => write(name));

    await rotate();

    for (const name of foreign) expect(has(name), name).toBe(true);
    for (const name of names(OLD)) expect(has(name), name).toBe(false);
  });

  it("leaves folders with a matching name alone", async () => {
    writeSet(RECENT);
    mkdirSync(join(dir, `media_${OLD}.tar.gz`));

    await rotate();

    expect(lstatSync(join(dir, `media_${OLD}.tar.gz`)).isDirectory()).toBe(true);
  });

  it("never follows a symlink, nor counts one towards a complete set", async () => {
    const outside = join(base, "precious.dump");
    writeFileSync(outside, "keep me");
    writeSet(RECENT);
    write(`media_${OLD}.tar.gz`);
    symlinkSync(outside, join(dir, `${DB}_${OLD}.dump`));
    const newest = "20261102-120000";
    writeSet(newest);
    rmSync(join(dir, `${DB}_${newest}.dump`));
    symlinkSync(outside, join(dir, `${DB}_${newest}.dump`));

    await rotate();

    expect(existsSync(outside)).toBe(true);
    expect(lstatSync(join(dir, `${DB}_${OLD}.dump`)).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(dir, `${DB}_${newest}.dump`)).isSymbolicLink()).toBe(true);
  });

  it("refuses a backup directory that is itself a symlink", async () => {
    writeSet(OLD);
    writeSet(RECENT);
    const link = join(base, "link");
    symlinkSync(dir, link);

    await expect(rotateBackups(link, DB, NOW)).rejects.toThrow("not a plain folder");

    for (const name of names(OLD)) expect(has(name), name).toBe(true);
  });

  it("copes with a backup directory that does not exist", async () => {
    await expect(rotateBackups(join(base, "none"), DB, NOW)).resolves.toEqual({
      sets: 0,
      files: 0,
    });
  });

  it("treats a database name literally", async () => {
    writeSet(RECENT);
    const lookalike = `maisonXvault_${OLD}.dump`;
    write(lookalike);

    await rotateBackups(dir, "maison.vault", NOW);

    expect(has(lookalike)).toBe(true);
  });
});
