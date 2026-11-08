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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inquiries, users } from "@/db/schema";
import { createUser } from "@/lib/server/auth/service";
import {
  ERASURE_LEDGER_FILE,
  ErasureNotRecordedError,
  applyErasureLedger,
  eraseInquiry,
  readErasureLedger,
} from "@/lib/server/inquiries/erasure";
import { closeTestDb, tempMediaRoot, testDb } from "./helpers";

let storage: ReturnType<typeof tempMediaRoot>;
let ledger: string;
beforeEach(() => {
  storage = tempMediaRoot();
  ledger = join(storage.root, ERASURE_LEDGER_FILE);
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

async function stored(): Promise<string> {
  const id = randomUUID();
  await testDb.insert(inquiries).values({
    id,
    kind: "sell",
    locale: "de",
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
    expect((await readErasureLedger(storage.root)).map((e) => e.id)).toEqual([
      first,
      second,
    ]);
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

describe("readErasureLedger", () => {
  it("treats a missing ledger as empty", async () => {
    expect(await readErasureLedger(storage.root)).toEqual([]);
  });

  it("reads every entry", async () => {
    writeFileSync(ledger, `${line()}\n${line(randomUUID())}\n`);
    expect(await readErasureLedger(storage.root)).toHaveLength(2);
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
    ["a torn last line", `${line()}\n${line().slice(0, 12)}`, 2],
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
