import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { inquiries, users } from "@/db/schema";
import { INQUIRY_LIMITS } from "@/lib/inquiries/policy";
import { createUser } from "@/lib/server/auth/service";
import {
  UserRuleError,
  changeUserRole,
  createUserAsOwner,
} from "@/lib/server/auth/users";
import { hashAddress, recordInquiry } from "@/lib/server/inquiries/service";
import { closeTestDb, testDb, withRollback } from "./helpers";

/*
 * These tests COMMIT real, parallel transactions (each on its own pooled
 * connection) to prove the advisory locks; rollback-wrapped tests cannot.
 * Every record uses unique values and is removed afterwards.
 */
afterAll(closeTestDb);

const PASSWORD = "correct horse battery staple";
const unique = () => randomUUID().slice(0, 8);

describe("user management under concurrency", () => {
  it("two owners demoting each other at once leave exactly one active owner", async () => {
    const id = unique();
    const [a, b] = await Promise.all(
      ["a", "b"].map((n) =>
        createUser(testDb, {
          email: `${n}-${id}@example.com`,
          name: n,
          role: "owner",
          password: PASSWORD,
        }),
      ),
    );
    try {
      const results = await Promise.allSettled([
        testDb.transaction((tx) => changeUserRole(tx, a!.id, b!.id, "editor")),
        testDb.transaction((tx) => changeUserRole(tx, b!.id, a!.id, "editor")),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected");
      expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(UserRuleError);
      expect((rejected as PromiseRejectedResult).reason.code).toBe("forbidden");
      const rows = await testDb
        .select({ role: users.role })
        .from(users)
        .where(inArray(users.id, [a!.id, b!.id]));
      expect(rows.filter((r) => r.role === "owner")).toHaveLength(1);
    } finally {
      await testDb.delete(users).where(inArray(users.id, [a!.id, b!.id]));
    }
  });
});

describe("inquiry limits under concurrency", () => {
  it("parallel submissions from one address never exceed the limit", async () => {
    const addressHash = hashAddress(
      `198.18.${Math.floor(Math.random() * 250)}.${unique()}`,
    );
    const ids = Array.from({ length: INQUIRY_LIMITS.perAddress + 3 }, () => randomUUID());
    try {
      const outcomes = await Promise.all(
        ids.map((id) =>
          testDb.transaction((tx) =>
            recordInquiry(tx, {
              id,
              kind: "contact",
              locale: "de",
              productSlug: null,
              data: {},
              submissionKey: null,
              addressHash,
              photos: [],
            }),
          ),
        ),
      );
      expect(outcomes.filter((o) => o.outcome === "stored")).toHaveLength(
        INQUIRY_LIMITS.perAddress,
      );
      expect(outcomes.filter((o) => o.outcome === "rateLimited")).toHaveLength(3);
    } finally {
      await testDb.delete(inquiries).where(inArray(inquiries.id, ids));
    }
  });
});

describe("createUserAsOwner", () => {
  it("re-checks the actor and reports duplicates as a rule, not a crash", () =>
    withRollback(async (tx) => {
      const owner = await createUser(tx, {
        email: "owner@example.com",
        name: "Owner",
        role: "owner",
        password: PASSWORD,
      });
      const input = {
        email: "New@Example.com",
        name: "New",
        role: "editor" as const,
        password: PASSWORD,
      };
      const created = await createUserAsOwner(tx, owner.id, input);
      await expect(
        createUserAsOwner(tx, owner.id, { ...input, email: "new@example.com" }),
      ).rejects.toMatchObject({ code: "duplicate" });
      await expect(
        createUserAsOwner(tx, created.id, { ...input, email: "other@example.com" }),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        createUserAsOwner(tx, owner.id, {
          ...input,
          email: "weak@example.com",
          password: "x",
        }),
      ).rejects.toMatchObject({ code: "weakPassword" });
      const [row] = await tx.select().from(users).where(eq(users.id, created.id));
      expect(row?.email).toBe("new@example.com");
    }));
});
