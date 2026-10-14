import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { Executor } from "@/db/connection";
import { auditEvents, inquiries, inquiryPhotos } from "@/db/schema";
import { INQUIRY_LIMITS, INQUIRY_RETENTION } from "@/lib/inquiries/policy";
import { createUser } from "@/lib/server/auth/service";
import {
  countNewInquiries,
  deleteInquiry,
  getInquiry,
  hashAddress,
  isRateLimited,
  listInquiries,
  purgeExpiredInquiries,
  recordInquiry,
  setInquiryStatus,
  type NewInquiry,
} from "@/lib/server/inquiries/service";
import { closeTestDb, withRollback } from "./helpers";

afterAll(closeTestDb);

const now = new Date("2026-10-14T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);
const address = hashAddress("203.0.113.7", now);

const inquiry = (overrides: Partial<NewInquiry> = {}): NewInquiry => ({
  id: randomUUID(),
  kind: "contact",
  locale: "de",
  productSlug: null,
  data: { name: "Anna", email: "anna@example.com", phone: "", message: "Hallo" },
  submissionKey: randomUUID(),
  addressHash: address,
  photos: [],
  ...overrides,
});

const owner = (tx: Executor) =>
  createUser(tx, {
    email: "owner@example.com",
    name: "Owner",
    role: "owner",
    password: "correct horse battery staple",
  });

describe("recordInquiry", () => {
  it("stores the inquiry with its photos as new", () =>
    withRollback(async (tx) => {
      const input = inquiry({
        kind: "sell",
        photos: [
          {
            position: 0,
            key: "inquiries/a/0_aaaa.webp",
            width: 10,
            height: 8,
            bytes: 99,
          },
          {
            position: 1,
            key: "inquiries/a/1_bbbb.webp",
            width: 10,
            height: 8,
            bytes: 98,
          },
        ],
      });
      const result = await recordInquiry(tx, input, now);
      expect(result.outcome).toBe("stored");
      const found = await getInquiry(tx, input.id);
      expect(found?.inquiry.status).toBe("new");
      expect(found?.photos.map((p) => p.position)).toEqual([0, 1]);
      expect(await countNewInquiries(tx)).toBe(1);
    }));

  it("is idempotent per submission key (double click / retry)", () =>
    withRollback(async (tx) => {
      const first = inquiry();
      await recordInquiry(tx, first, now);
      const retry = { ...first, id: randomUUID() };
      expect((await recordInquiry(tx, retry, now)).outcome).toBe("duplicate");
      expect(await tx.select().from(inquiries)).toHaveLength(1);
    }));

  it("limits submissions per address within the window (boundary)", () =>
    withRollback(async (tx) => {
      for (let i = 0; i < INQUIRY_LIMITS.perAddress; i++) {
        expect(await isRateLimited(tx, address, { withPhotos: false, now })).toBe(false);
        expect((await recordInquiry(tx, inquiry(), now)).outcome).toBe("stored");
      }
      expect(await isRateLimited(tx, address, { withPhotos: false, now })).toBe(true);
      expect((await recordInquiry(tx, inquiry(), now)).outcome).toBe("rateLimited");
      // Another visitor is not affected …
      const other = inquiry({ addressHash: hashAddress("198.51.100.1") });
      expect((await recordInquiry(tx, other, now)).outcome).toBe("stored");
      // … and the limit lifts once the window has passed.
      expect(
        (await recordInquiry(tx, inquiry(), later(INQUIRY_LIMITS.windowMs + 1))).outcome,
      ).toBe("stored");
    }));

  it("caps photo submissions across all addresses, never plain questions", () =>
    withRollback(async (tx) => {
      for (let i = 0; i < INQUIRY_LIMITS.global; i++) {
        const id = randomUUID();
        await tx.insert(inquiries).values({
          id,
          kind: "sell",
          locale: "de",
          data: {},
          addressHash: hashAddress(`10.0.${Math.floor(i / 250)}.${i % 250}`),
          createdAt: now,
        });
        await tx.insert(inquiryPhotos).values({
          inquiryId: id,
          position: 0,
          key: `inquiries/${id}/0_x.webp`,
          width: 1,
          height: 1,
          bytes: 1,
        });
      }
      const fresh = hashAddress("192.0.2.99");
      expect(await isRateLimited(tx, fresh, { withPhotos: true, now })).toBe(true);
      const photo = {
        position: 0,
        key: "inquiries/y/0_y.webp",
        width: 1,
        height: 1,
        bytes: 1,
      };
      expect(
        (await recordInquiry(tx, inquiry({ addressHash: fresh, photos: [photo] }), now))
          .outcome,
      ).toBe("rateLimited");
      // A question without photos still gets through during such a flood.
      expect(await isRateLimited(tx, fresh, { withPhotos: false, now })).toBe(false);
      expect(
        (await recordInquiry(tx, inquiry({ addressHash: fresh }), now)).outcome,
      ).toBe("stored");
    }));

  it("never stores the raw client address", () =>
    withRollback(async (tx) => {
      const input = inquiry();
      await recordInquiry(tx, input, now);
      const [row] = await tx.select().from(inquiries).where(eq(inquiries.id, input.id));
      expect(JSON.stringify(row)).not.toContain("203.0.113.7");
      expect(row?.addressHash).toMatch(/^[0-9a-f]{64}$/);
    }));

  it("keys the address hash with a secret that changes every day", () => {
    const plain = createHash("sha256").update("203.0.113.7").digest("hex");
    const salted = createHash("sha256").update("inquiry:203.0.113.7").digest("hex");
    const today = hashAddress("203.0.113.7", now);
    // Not reproducible without the in-memory key …
    expect([plain, salted]).not.toContain(today);
    // … stable within a day (the rate limit works) …
    expect(hashAddress("203.0.113.7", later(60_000))).toBe(today);
    // … and unlinkable across days.
    expect(hashAddress("203.0.113.7", later(INQUIRY_RETENTION.addressHashMs))).not.toBe(
      today,
    );
  });
});

describe("purgeExpiredInquiries", () => {
  it("clears address hashes after a day and deletes expired inquiries", () =>
    withRollback(async (tx) => {
      const user = await owner(tx);
      const open = inquiry();
      const done = inquiry({ addressHash: hashAddress("198.51.100.2") });
      const ancient = inquiry({ addressHash: hashAddress("198.51.100.3") });
      await recordInquiry(tx, open, now);
      await recordInquiry(tx, done, now);
      await recordInquiry(tx, ancient, now);
      await tx.insert(inquiryPhotos).values({
        inquiryId: done.id,
        position: 0,
        key: "k",
        width: 1,
        height: 1,
        bytes: 1,
      });
      await setInquiryStatus(tx, user.id, done.id, "done", now);

      // A day later only the address hashes go.
      expect(
        await purgeExpiredInquiries(tx, later(INQUIRY_RETENTION.addressHashMs + 1)),
      ).toEqual([]);
      const rows = await tx.select().from(inquiries);
      expect(rows.every((r) => r.addressHash === null)).toBe(true);

      // After the "done" period the finished one is deleted (with its photos).
      const purged = await purgeExpiredInquiries(tx, later(INQUIRY_RETENTION.doneMs + 1));
      expect(purged).toEqual([done.id]);
      expect(await tx.select().from(inquiryPhotos)).toEqual([]);

      // After a year, everything is gone regardless of status.
      const rest = await purgeExpiredInquiries(tx, later(INQUIRY_RETENTION.anyMs + 1));
      expect(rest.sort()).toEqual([open.id, ancient.id].sort());
      expect(await tx.select().from(inquiries)).toEqual([]);
    }));
});

describe("admin inbox", () => {
  it("lists newest first and filters by status", () =>
    withRollback(async (tx) => {
      const user = await owner(tx);
      const a = inquiry();
      const b = inquiry({ kind: "product", productSlug: "rolex-submariner" });
      await recordInquiry(tx, a, now);
      await recordInquiry(tx, b, later(1000));
      expect((await listInquiries(tx)).map((r) => r.id)).toEqual([b.id, a.id]);
      await setInquiryStatus(tx, user.id, a.id, "in_progress", now);
      expect((await listInquiries(tx, "new")).map((r) => r.id)).toEqual([b.id]);
      expect((await listInquiries(tx, "in_progress")).map((r) => r.id)).toEqual([a.id]);
      expect(await countNewInquiries(tx)).toBe(1);
    }));

  it("audits status changes without personal data and records the handler", () =>
    withRollback(async (tx) => {
      const user = await owner(tx);
      const a = inquiry();
      await recordInquiry(tx, a, now);
      expect(await setInquiryStatus(tx, user.id, a.id, "done", now)).toBe(true);
      // Same status again is a no-op (idempotent).
      expect(await setInquiryStatus(tx, user.id, a.id, "done", now)).toBe(true);
      const found = await getInquiry(tx, a.id);
      expect(found?.inquiry.handledBy).toBe(user.id);
      const audit = await tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, a.id));
      expect(audit.map((e) => [e.action, e.details])).toEqual([
        ["inquiry.status_changed", { from: "new", to: "done" }],
      ]);
      expect(JSON.stringify(audit)).not.toContain("anna@example.com");
    }));

  it("deletes on request (right to erasure) and reports unknown ids", () =>
    withRollback(async (tx) => {
      const user = await owner(tx);
      const a = inquiry();
      await recordInquiry(tx, a, now);
      expect(await deleteInquiry(tx, user.id, a.id)).toBe(true);
      expect(await getInquiry(tx, a.id)).toBeNull();
      expect(await deleteInquiry(tx, user.id, a.id)).toBe(false);
      expect(await setInquiryStatus(tx, user.id, a.id, "done", now)).toBe(false);
      const [event] = await tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, "inquiry.deleted"));
      expect(event?.entityId).toBe(a.id);
      expect(JSON.stringify(event)).not.toContain("Anna");
    }));
});
