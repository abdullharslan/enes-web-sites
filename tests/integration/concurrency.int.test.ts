import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { brands, inquiries, sessions, users } from "@/db/schema";
import { INQUIRY_LIMITS } from "@/lib/inquiries/policy";
import {
  InactiveAccountError,
  createSession,
  createUser,
} from "@/lib/server/auth/service";
import {
  UserRuleError,
  changeUserRole,
  createUserAsOwner,
  setUserActive,
} from "@/lib/server/auth/users";
import { saveBrand } from "@/lib/server/catalog/admin";
import { restoreAny } from "@/lib/server/history";
import { listRevisions } from "@/lib/server/revisions";
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

describe("login racing with deactivation", () => {
  // Long enough for the second transaction to reach its lock (or, without one, to finish).
  const letOtherSideRun = () => new Promise((resolve) => setTimeout(resolve, 150));

  async function withOwnerAndEditor(
    run: (ownerId: string, editorId: string) => Promise<void>,
  ) {
    const id = unique();
    const [owner, editor] = await Promise.all(
      (["owner", "editor"] as const).map((role) =>
        createUser(testDb, {
          email: `${role}-${id}@example.com`,
          name: role,
          role,
          password: PASSWORD,
        }),
      ),
    );
    try {
      await run(owner!.id, editor!.id);
      const left = await testDb
        .select({ id: sessions.tokenHash })
        .from(sessions)
        .where(eq(sessions.userId, editor!.id));
      expect(left).toHaveLength(0);
    } finally {
      await testDb.delete(users).where(inArray(users.id, [owner!.id, editor!.id]));
    }
  }

  it("a login arriving during a deactivation gets no session", () =>
    withOwnerAndEditor(async (ownerId, editorId) => {
      let login: Promise<unknown> = Promise.resolve();
      await testDb.transaction(async (tx) => {
        await setUserActive(tx, ownerId, editorId, false);
        login = createSession(testDb, editorId).then(
          () => "created",
          (error: unknown) => error,
        );
        await letOtherSideRun();
      });
      expect(await login).toBeInstanceOf(InactiveAccountError);
    }));

  it("a deactivation arriving during a login removes the new session", () =>
    withOwnerAndEditor(async (ownerId, editorId) => {
      let deactivation: Promise<unknown> = Promise.resolve();
      await testDb.transaction(async (tx) => {
        await createSession(tx, editorId);
        deactivation = testDb.transaction((other) =>
          setUserActive(other, ownerId, editorId, false),
        );
        await letOtherSideRun();
      });
      await deactivation;
    }));
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

describe("duplicate admin saves under concurrency", () => {
  it("two parallel copies of one save (same key) both get the first result", async () => {
    const slug = `dup-${unique()}`;
    const base = {
      slug,
      name: "Dup",
      description: { de: "x" },
      sortOrder: 0,
      isVisible: true,
    };
    const { id } = await testDb.transaction((tx) =>
      saveBrand(tx, null, null, { ...base, expectedVersion: 0 }),
    );
    try {
      const key = randomUUID();
      const save = () =>
        testDb.transaction((tx) =>
          saveBrand(
            tx,
            null,
            id,
            { ...base, expectedVersion: 1 },
            { idempotencyKey: key },
          ),
        );
      const [a, b] = await Promise.all([save(), save()]);
      expect(a).toEqual(b);
      expect(a.version).toBe(2);
    } finally {
      await testDb.delete(brands).where(eq(brands.id, id));
    }
  });
});

describe("duplicate admin creates under concurrency", () => {
  it("two parallel copies of one create (same key) make one record", async () => {
    const slug = `dup-create-${unique()}`;
    const key = randomUUID();
    const create = () =>
      testDb.transaction((tx) =>
        saveBrand(
          tx,
          null,
          null,
          {
            slug,
            name: "Dup create",
            description: { de: "x" },
            sortOrder: 0,
            isVisible: true,
            expectedVersion: 0,
          },
          { idempotencyKey: key },
        ),
      );
    const results = await Promise.all([create(), create()]);
    try {
      expect(results[1]).toEqual(results[0]);
      expect(
        await testDb.select().from(brands).where(eq(brands.slug, slug)),
      ).toHaveLength(1);
    } finally {
      await testDb.delete(brands).where(eq(brands.slug, slug));
    }
  });
});

describe("duplicate restores under concurrency", () => {
  it("two parallel copies of one restore (same key) restore once", async () => {
    const slug = `dup-restore-${unique()}`;
    const base = {
      slug,
      name: "A",
      description: { de: "x" },
      sortOrder: 0,
      isVisible: true,
    };
    const { id } = await testDb.transaction((tx) =>
      saveBrand(tx, null, null, { ...base, expectedVersion: 0 }),
    );
    try {
      await testDb.transaction((tx) =>
        saveBrand(tx, null, id, { ...base, name: "B", expectedVersion: 1 }),
      );
      const key = randomUUID();
      const restore = () =>
        testDb.transaction((tx) => restoreAny(tx, null, "brand", id, 1, 2, key));
      const [a, b] = await Promise.all([restore(), restore()]);
      expect(a).toEqual(b);
      expect(await listRevisions(testDb, "brand", id)).toHaveLength(3);
    } finally {
      await testDb.delete(brands).where(eq(brands.id, id));
    }
  });
});
