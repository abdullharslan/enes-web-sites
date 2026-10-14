import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { inquiries } from "@/db/schema";
import { applyInquiryRetention } from "@/lib/server/inquiries/retention";
import { closeTestDb, tempMediaRoot, testDb } from "./helpers";

afterAll(closeTestDb);

let storage: ReturnType<typeof tempMediaRoot>;
beforeEach(() => {
  storage = tempMediaRoot();
});
afterEach(() => storage.cleanup());

const HOUR = 60 * 60 * 1000;

function folder(id: string, ageMs: number) {
  const path = join(storage.root, "inquiries", id);
  mkdirSync(path, { recursive: true });
  const time = new Date(Date.now() - ageMs);
  utimesSync(path, time, time);
  return path;
}

describe("applyInquiryRetention (orphan photo folders)", () => {
  it("removes only old folders without a row, in chunks, however many there are", async () => {
    const kept = randomUUID();
    await testDb
      .insert(inquiries)
      .values({ id: kept, kind: "sell", locale: "de", data: {} });
    try {
      const keptPath = folder(kept, 2 * HOUR);
      const young = folder(randomUUID(), 60_000);
      // More than PostgreSQL's 65,535 bind parameters: one giant IN (...) list would fail.
      const orphans = Array.from({ length: 66_000 }, () =>
        folder(randomUUID(), 2 * HOUR),
      );

      const result = await applyInquiryRetention(testDb, storage.root);

      expect(result.orphans).toBe(66_000);
      expect(orphans.some(existsSync)).toBe(false);
      expect(existsSync(keptPath)).toBe(true);
      // A submission still being stored (fresh folder, no row yet) is left alone.
      expect(existsSync(young)).toBe(true);
    } finally {
      await testDb.delete(inquiries).where(inArray(inquiries.id, [kept]));
    }
  }, 180_000);

  it("copes with a missing storage folder", async () => {
    storage.cleanup();
    await expect(applyInquiryRetention(testDb, storage.root)).resolves.toMatchObject({
      orphans: 0,
    });
  });
});
