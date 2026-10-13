import { afterAll, describe, expect, it } from "vitest";
import { listRevisions, recordRevision } from "@/lib/server/revisions";
import { closeTestDb, withRollback } from "./helpers";

afterAll(closeTestDb);

const entity = { entityType: "brand", entityId: "11111111-1111-1111-1111-111111111111" };

describe("recordRevision", () => {
  it("numbers revisions per entity starting at 1", () =>
    withRollback(async (tx) => {
      const first = await recordRevision(tx, { ...entity, data: { name: "Rolex" } });
      const second = await recordRevision(tx, { ...entity, data: { name: "Rolex SA" } });
      const other = await recordRevision(tx, { ...entity, entityId: "other", data: {} });
      expect([first.version, second.version, other.version]).toEqual([1, 2, 1]);
      expect(first.created && second.created).toBe(true);
    }));

  it("is idempotent for a repeated idempotency key", () =>
    withRollback(async (tx) => {
      const a = await recordRevision(tx, {
        ...entity,
        data: { v: 1 },
        idempotencyKey: "req-1",
      });
      const b = await recordRevision(tx, {
        ...entity,
        data: { v: 1 },
        idempotencyKey: "req-1",
      });
      expect(b).toEqual({ version: a.version, created: false });
      expect(await listRevisions(tx, entity.entityType, entity.entityId)).toHaveLength(1);
    }));

  it("lists newest first with the stored snapshot", () =>
    withRollback(async (tx) => {
      await recordRevision(tx, { ...entity, data: { name: "A" }, comment: "first" });
      await recordRevision(tx, { ...entity, data: { name: "B" } });
      const list = await listRevisions(tx, entity.entityType, entity.entityId);
      expect(list.map((r) => [r.version, r.data])).toEqual([
        [2, { name: "B" }],
        [1, { name: "A" }],
      ]);
      expect(list[1]?.comment).toBe("first");
    }));
});
