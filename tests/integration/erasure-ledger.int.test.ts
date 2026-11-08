import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { inquiries, users } from "@/db/schema";
import { createUser } from "@/lib/server/auth/service";
import {
  ERASURE_LEDGER_FILE,
  ErasureNotRecordedError,
  applyErasureLedger,
  eraseInquiry,
  lockErasureLedger,
  mergeErasureLedger,
  readErasureLedger,
  recordErasures,
} from "@/lib/server/inquiries/erasure";
import { applyInquiryRetention } from "@/lib/server/inquiries/retention";
import { closeTestDb, tempMediaRoot, testDb } from "./helpers";

/** Hooks into the ledger's file handle: real writes, with faults on request. */
const faults = vi.hoisted(() => ({
  tear: null as { keep: number; pauseMs: number } | null,
  writes: 0,
  syncs: 0,
  afterSync: null as (() => Promise<void>) | null,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  const open = async (...args: Parameters<typeof real.open>) => {
    const handle = await real.open(...args);
    if (!String(args[0]).endsWith("erasure-ledger.jsonl")) return handle;
    const appendFile = handle.appendFile.bind(handle);
    const sync = handle.sync.bind(handle);
    handle.appendFile = async (data, options) => {
      faults.writes += 1;
      const tear = faults.tear;
      if (!tear) return appendFile(data, options);
      faults.tear = null;
      await handle.write(String(data).slice(0, tear.keep));
      await new Promise((resolve) => setTimeout(resolve, tear.pauseMs));
      throw Object.assign(new Error("no space"), { code: "ENOSPC" });
    };
    handle.sync = async () => {
      faults.syncs += 1;
      await sync();
      await faults.afterSync?.();
    };
    return handle;
  };
  return { ...real, default: { ...real, open }, open };
});

let storage: ReturnType<typeof tempMediaRoot>;
let ledger: string;
beforeEach(() => {
  storage = tempMediaRoot();
  ledger = join(storage.root, ERASURE_LEDGER_FILE);
  Object.assign(faults, { tear: null, writes: 0, syncs: 0, afterSync: null });
});
afterEach(async () => {
  storage.cleanup();
  await testDb.delete(inquiries);
});

let actorId: string;
beforeAll(async () => {
  const user = await testDb.transaction((tx) =>
    createUser(tx, {
      email: `erasure-${randomUUID()}@example.com`,
      name: "Owner",
      role: "owner",
      password: "correct horse battery staple",
    }),
  );
  actorId = user.id;
});
afterAll(async () => {
  await testDb.delete(users).where(eq(users.id, actorId));
  await closeTestDb();
});

async function stored(createdAt = new Date()): Promise<string> {
  const id = randomUUID();
  await testDb.insert(inquiries).values({
    id,
    kind: "sell",
    locale: "de",
    createdAt,
    data: { name: "Anna Erased", email: "anna@example.com" },
  });
  mkdirSync(photoFolder(id), { recursive: true });
  writeFileSync(join(photoFolder(id), "0_aaaa.webp"), "photo");
  return id;
}
const photoFolder = (id: string) => join(storage.root, "inquiries", id);
const isStored = async (id: string) =>
  (await testDb.select().from(inquiries).where(eq(inquiries.id, id))).length === 1;

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const AT = new Date("2026-11-08T10:00:00.000Z");
const record = (ids: string[]) =>
  testDb.transaction((tx) => recordErasures(tx, storage.root, ids, AT));
const entryIds = async (root = storage.root) =>
  (await readErasureLedger(root)).entries.map((entry) => entry.id);
const line = (id = ID_A, erasedAt = "2026-11-08T10:00:00.000Z") =>
  JSON.stringify({ id, erasedAt });

describe("eraseInquiry", () => {
  it("records only the id and time, owner-readable, and removes the row and photos", async () => {
    const id = await stored();
    const at = new Date("2026-11-08T10:00:00Z");

    expect(await eraseInquiry(testDb, storage.root, actorId, id, at)).toBe(true);

    expect(readFileSync(ledger, "utf8")).toBe(`${line(id)}\n`);
    expect(statSync(ledger).mode & 0o777).toBe(0o600);
    expect(await isStored(id)).toBe(false);
    expect(existsSync(photoFolder(id))).toBe(false);
  });

  it("keeps earlier entries (append-only)", async () => {
    const [first, second] = [await stored(), await stored()];
    await eraseInquiry(testDb, storage.root, actorId, first!);
    await eraseInquiry(testDb, storage.root, actorId, second!);
    expect(await entryIds()).toEqual([first, second]);
  });

  it("records nothing for an inquiry that does not exist", async () => {
    expect(await eraseInquiry(testDb, storage.root, actorId, randomUUID())).toBe(false);
    expect(existsSync(ledger)).toBe(false);
  });

  it("fails closed: nothing is deleted when the ledger cannot be written", async () => {
    const id = await stored();
    mkdirSync(ledger); // a directory in its place makes every append fail

    await expect(eraseInquiry(testDb, storage.root, actorId, id)).rejects.toBeInstanceOf(
      ErasureNotRecordedError,
    );

    expect(await isStored(id)).toBe(true);
    expect(existsSync(photoFolder(id))).toBe(true);
  });
});

describe("recordErasures", () => {
  it("writes a whole batch at once and syncs it once", async () => {
    await record([ID_A, ID_B, ID_C]);

    expect(readFileSync(ledger, "utf8")).toBe(
      `${line(ID_A)}\n${line(ID_B)}\n${line(ID_C)}\n`,
    );
    expect(faults.writes).toBe(1);
    expect(faults.syncs).toBe(1);
  });

  it("does not touch the disk for an empty batch", async () => {
    await record([]);
    expect(existsSync(ledger)).toBe(false);
  });

  it("rolls a failed write back to the size before it", async () => {
    writeFileSync(ledger, `${line(ID_A)}\n`);
    faults.tear = { keep: 12, pauseMs: 0 };

    await expect(record([ID_B])).rejects.toBeInstanceOf(ErasureNotRecordedError);

    expect(readFileSync(ledger, "utf8")).toBe(`${line(ID_A)}\n`);
  });

  it("serialises appends: a failing write cannot take a concurrent one with it", async () => {
    writeFileSync(ledger, `${line(ID_A)}\n`);
    faults.tear = { keep: 12, pauseMs: 40 };

    const [failed, succeeded] = await Promise.allSettled([
      record([ID_B]),
      record([ID_C]),
    ]);

    expect(failed.status).toBe("rejected");
    expect(succeeded.status).toBe("fulfilled");
    expect(readFileSync(ledger, "utf8")).toBe(`${line(ID_A)}\n${line(ID_C)}\n`);
  });

  it("removes a torn tail before appending instead of gluing onto it", async () => {
    writeFileSync(ledger, `${line(ID_A)}\n${line(ID_B).slice(0, 12)}`);

    await record([ID_C]);

    expect(readFileSync(ledger, "utf8")).toBe(`${line(ID_A)}\n${line(ID_C)}\n`);
  });

  it("handles a ledger that is nothing but a torn tail", async () => {
    writeFileSync(ledger, line(ID_B).slice(0, 12));

    await record([ID_C]);

    expect(readFileSync(ledger, "utf8")).toBe(`${line(ID_C)}\n`);
  });
});

describe("the lock shared by every ledger writer", () => {
  /** Runs `write` while another database connection (as another process would) holds the lock. */
  async function whileLockedElsewhere(write: () => Promise<unknown>) {
    let writing: Promise<unknown> = Promise.resolve();
    await testDb.transaction(async (tx) => {
      await lockErasureLedger(tx);
      writing = write();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(faults.writes).toBe(0);
    });
    await writing;
    expect(faults.writes).toBe(1);
  }

  it("makes an erasure wait", async () => {
    const id = await stored();
    await whileLockedElsewhere(() => eraseInquiry(testDb, storage.root, actorId, id));
    expect(await entryIds()).toEqual([id]);
  });

  it("makes a retention purge wait", async () => {
    const id = await stored(new Date(AT.getTime() - 2 * 365 * 24 * 60 * 60 * 1000));
    await whileLockedElsewhere(() => applyInquiryRetention(testDb, storage.root, AT));
    expect(await entryIds()).toEqual([id]);
  });

  it("makes a restore's merge wait", async () => {
    const archived = tempMediaRoot();
    try {
      writeFileSync(join(archived.root, ERASURE_LEDGER_FILE), `${line(ID_A)}\n`);
      await whileLockedElsewhere(() =>
        mergeErasureLedger(testDb, storage.root, archived.root),
      );
      expect(await entryIds()).toEqual([ID_A]);
    } finally {
      archived.cleanup();
    }
  });
});

describe("mergeErasureLedger", () => {
  let archived: ReturnType<typeof tempMediaRoot>;
  beforeEach(() => {
    archived = tempMediaRoot();
  });
  afterEach(() => archived.cleanup());
  const writeArchived = (text: string) =>
    writeFileSync(join(archived.root, ERASURE_LEDGER_FILE), text);

  it("adds what only the archive has and keeps the live ledger as its prefix", async () => {
    writeFileSync(ledger, `${line(ID_A)}\n${line(ID_B)}\n`);
    writeArchived(`${line(ID_B)}\n${line(ID_C)}\n`);

    await expect(
      mergeErasureLedger(testDb, storage.root, archived.root),
    ).resolves.toEqual({
      added: 1,
      tornLines: 0,
    });

    expect(readFileSync(ledger, "utf8")).toBe(
      `${line(ID_A)}\n${line(ID_B)}\n${line(ID_C)}\n`,
    );
  });

  it("creates the live ledger on a host that has none", async () => {
    writeArchived(`${line(ID_A)}\n`);

    await mergeErasureLedger(testDb, storage.root, archived.root);

    expect(readFileSync(ledger, "utf8")).toBe(`${line(ID_A)}\n`);
    expect(statSync(ledger).mode & 0o777).toBe(0o600);
  });

  it("does not rewrite anything when the archive adds nothing", async () => {
    writeFileSync(ledger, `${line(ID_A)}\n`);
    writeArchived(`${line(ID_A)}\n`);

    await mergeErasureLedger(testDb, storage.root, archived.root);

    expect(faults.writes).toBe(0);
  });

  it("counts a torn tail in the archive and ignores it", async () => {
    writeArchived(`${line(ID_A)}\n${line(ID_B).slice(0, 12)}`);

    await expect(
      mergeErasureLedger(testDb, storage.root, archived.root),
    ).resolves.toEqual({
      added: 1,
      tornLines: 1,
    });
    expect(await entryIds()).toEqual([ID_A]);
  });

  it("refuses an archive ledger with a malformed line and changes nothing", async () => {
    writeFileSync(ledger, `${line(ID_A)}\n`);
    writeArchived(`${line(ID_B)}\ngarbage\n`);

    await expect(mergeErasureLedger(testDb, storage.root, archived.root)).rejects.toThrow(
      "line 2",
    );

    expect(readFileSync(ledger, "utf8")).toBe(`${line(ID_A)}\n`);
  });
});

describe("retention deletions", () => {
  const YEAR = 365 * 24 * 60 * 60 * 1000;
  const longAgo = () => new Date(Date.now() - 2 * YEAR);

  it("are recorded with ids and the time only, in one synced batch", async () => {
    const [first, second] = [await stored(longAgo()), await stored(longAgo())];
    const kept = await stored();

    await applyInquiryRetention(testDb, storage.root, AT);

    const { entries } = await readErasureLedger(storage.root);
    expect(entries.map((entry) => entry.id).sort()).toEqual([first, second].sort());
    expect(entries.every((entry) => entry.erasedAt === AT.toISOString())).toBe(true);
    expect(faults.syncs).toBe(1);
    expect(await isStored(first!)).toBe(false);
    expect(await isStored(kept)).toBe(true);
  });

  it("reach the disk before the deletion commits", async () => {
    const id = await stored(longAgo());
    let visibleAtSync: boolean | undefined;
    faults.afterSync = async () => {
      visibleAtSync = await isStored(id);
    };

    await applyInquiryRetention(testDb, storage.root);

    expect(visibleAtSync).toBe(true);
    expect(await isStored(id)).toBe(false);
  });

  it("write nothing when nothing expired", async () => {
    await stored();
    await applyInquiryRetention(testDb, storage.root);
    expect(existsSync(ledger)).toBe(false);
  });

  it("fail closed: no ledger entry, no deletion, photos stay", async () => {
    const id = await stored(longAgo());
    mkdirSync(ledger);

    await expect(applyInquiryRetention(testDb, storage.root)).rejects.toBeInstanceOf(
      ErasureNotRecordedError,
    );

    expect(await isStored(id)).toBe(true);
    expect(existsSync(photoFolder(id))).toBe(true);
  });

  it("do not hold back the 24-hour address cleanup when the ledger fails", async () => {
    const stale = randomUUID();
    await testDb.insert(inquiries).values({
      id: stale,
      kind: "sell",
      locale: "de",
      addressHash: "a".repeat(64),
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      data: {},
    });
    const expired = await stored(longAgo());
    mkdirSync(ledger);

    await expect(applyInquiryRetention(testDb, storage.root)).rejects.toBeInstanceOf(
      ErasureNotRecordedError,
    );

    const [row] = await testDb.select().from(inquiries).where(eq(inquiries.id, stale));
    expect(row?.addressHash).toBeNull();
    expect(await isStored(expired)).toBe(true);
  });
});

describe("readErasureLedger", () => {
  it("treats a missing ledger as empty", async () => {
    expect(await readErasureLedger(storage.root)).toEqual({ entries: [], tornLines: 0 });
  });

  it("reads every entry", async () => {
    writeFileSync(ledger, `${line()}\n${line(randomUUID())}\n`);
    expect((await readErasureLedger(storage.root)).entries).toHaveLength(2);
  });

  it("ignores an unterminated final fragment and counts it", async () => {
    writeFileSync(ledger, `${line()}\n${line(ID_B).slice(0, 12)}`);
    await expect(readErasureLedger(storage.root)).resolves.toMatchObject({
      entries: [{ id: ID_A }],
      tornLines: 1,
    });
  });

  it.each([
    ["not JSON", `${line()}\ngarbage\n`, 2],
    ["a blank line", `${line()}\n\n${line()}\n`, 2],
    ["a bad id", `${line("not-a-uuid")}\n`, 1],
    ["a bad time", `${line(ID_A, "yesterday")}\n`, 1],
    [
      "an extra field",
      `${JSON.stringify({ id: ID_A, erasedAt: "2026-11-08T10:00:00.000Z", email: "x@example.com" })}\n`,
      1,
    ],
    ["a bad line before a torn tail", `garbage\n${line().slice(0, 12)}`, 1],
  ])("stops on %s and names the line, not its content", async (_name, text, number) => {
    writeFileSync(ledger, text);
    const failure = await readErasureLedger(storage.root).catch((e: Error) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(`line ${number}`);
    expect((failure as Error).message).not.toContain("example.com");
  });
});

describe("applyErasureLedger", () => {
  it("deletes listed inquiries and photo folders, leaves all others", async () => {
    const [erased, kept] = [await stored(), await stored()];
    const rowGone = randomUUID();
    mkdirSync(photoFolder(rowGone), { recursive: true });
    writeFileSync(ledger, `${line(erased)}\n${line(erased)}\n${line(rowGone)}\n`);

    expect(await applyErasureLedger(testDb, storage.root)).toEqual({
      entries: 2,
      inquiries: 1,
    });

    expect(await isStored(erased!)).toBe(false);
    expect(existsSync(photoFolder(erased!))).toBe(false);
    expect(existsSync(photoFolder(rowGone))).toBe(false);
    expect(await isStored(kept!)).toBe(true);
    expect(existsSync(photoFolder(kept!))).toBe(true);
  });

  it("handles more ids than one query can carry", async () => {
    const id = await stored();
    const many = Array.from({ length: 66_000 }, () => line(randomUUID()));
    writeFileSync(ledger, `${[line(id), ...many].join("\n")}\n`);
    await expect(applyErasureLedger(testDb, storage.root)).resolves.toEqual({
      entries: 66_001,
      inquiries: 1,
    });
  }, 120_000);

  it("changes nothing when any line is malformed", async () => {
    const id = await stored();
    writeFileSync(ledger, `${line(id)}\n`);
    appendFileSync(ledger, "garbage\n");
    await expect(applyErasureLedger(testDb, storage.root)).rejects.toThrow("line 2");
    expect(await isStored(id)).toBe(true);
  });
});
