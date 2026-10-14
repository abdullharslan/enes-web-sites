import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { inquiries } from "@/db/schema";
import {
  ANALYTICS_RETENTION_DAYS,
  inquiriesPerDay,
  recordView,
  topPages,
  totalViews,
  viewsPerDay,
} from "@/lib/server/analytics/service";
import { closeTestDb, withRollback } from "./helpers";

afterAll(closeTestDb);

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const today = day("2026-10-14");

describe("analytics counters", () => {
  it("counts views per day, locale and page with a single row each", () =>
    withRollback(async (tx) => {
      await recordView(tx, { locale: "de", page: "/" }, today);
      await recordView(tx, { locale: "de", page: "/" }, today);
      await recordView(tx, { locale: "en", page: "/" }, today);
      await recordView(tx, { locale: "de", page: "/" }, day("2026-10-13"));

      expect(await viewsPerDay(tx, day("2026-10-13"))).toEqual([
        { day: "2026-10-13", count: 1 },
        { day: "2026-10-14", count: 3 },
      ]);
      expect(await totalViews(tx, today)).toBe(3);
    }));

  it("ranks pages, optionally within a section, across locales", () =>
    withRollback(async (tx) => {
      const view = (page: string, times: number) =>
        Promise.all(
          Array.from({ length: times }, (_, i) =>
            recordView(tx, { locale: i % 2 ? "en" : "de", page }, today),
          ),
        );
      await view("/collection/a", 3);
      await view("/collection/b", 5);
      await view("/brands/rolex", 2);
      expect(await topPages(tx, today, 10, "/collection/")).toEqual([
        { page: "/collection/b", count: 5 },
        { page: "/collection/a", count: 3 },
      ]);
      expect((await topPages(tx, today, 1)).map((r) => r.page)).toEqual([
        "/collection/b",
      ]);
    }));

  it("forgets counters older than the retention period", () =>
    withRollback(async (tx) => {
      const old = new Date(today.getTime() - (ANALYTICS_RETENTION_DAYS + 1) * 864e5);
      await recordView(tx, { locale: "de", page: "/" }, old);
      await recordView(tx, { locale: "de", page: "/" }, today);
      expect(await viewsPerDay(tx, old)).toEqual([{ day: "2026-10-14", count: 1 }]);
    }));

  it("counts inquiries per day and kind", () =>
    withRollback(async (tx) => {
      for (const [kind, at] of [
        ["sell", today],
        ["contact", today],
        ["contact", day("2026-10-12")],
      ] as const) {
        await tx.insert(inquiries).values({
          id: randomUUID(),
          kind,
          locale: "de",
          data: {},
          createdAt: at,
        });
      }
      expect(await inquiriesPerDay(tx, day("2026-10-10"))).toEqual([
        { day: "2026-10-12", kind: "contact", count: 1 },
        { day: "2026-10-14", kind: "contact", count: 1 },
        { day: "2026-10-14", kind: "sell", count: 1 },
      ]);
    }));
});
