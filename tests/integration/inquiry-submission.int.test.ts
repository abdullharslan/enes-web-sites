import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { submitInquiryAction } from "@/app/actions/inquiries";
import { inquiries } from "@/db/schema";
import type { Catalog, Product } from "@/lib/catalog/schema";
import { IDLE_FORM } from "@/lib/forms/state";
import { seedCatalogFixture } from "../fixtures/catalog";
import { closeTestDb, testDb } from "./helpers";

const current = vi.hoisted(() => ({ catalog: undefined as Catalog | undefined }));

vi.mock("@/db/client", async () => ({ db: (await import("./helpers")).testDb }));
vi.mock("@/lib/server/catalog", () => ({ getCatalog: async () => current.catalog }));
vi.mock("@/lib/server/request-address", () => ({
  requestAddressBucket: async () => "203.0.113.50",
}));
vi.mock("@/lib/server/inquiries/retention", () => ({
  maintainRetention: async () => undefined,
}));

const SLUG = "rolex-submariner-date-126610ln";

function catalogWith(change: (product: Product) => Product | null): Catalog {
  const catalog = seedCatalogFixture();
  return {
    ...catalog,
    products: catalog.products.flatMap((p) => (p.slug === SLUG ? (change(p) ?? []) : p)),
  };
}
const withStatus = (status: Product["status"]) => catalogWith((p) => ({ ...p, status }));
const hidden = () => catalogWith(() => null);

function productInquiry(submissionKey?: string) {
  const fd = new FormData();
  fd.set("kind", "product");
  fd.set("locale", "de");
  fd.set("productSlug", SLUG);
  fd.set("name", "Ada Lovelace");
  fd.set("email", "ada@example.com");
  fd.set("message", "Noch verfügbar?");
  if (submissionKey) fd.set("submissionKey", submissionKey);
  return fd;
}

const submit = (fd: FormData) => submitInquiryAction(IDLE_FORM, fd);
const stored = () => testDb.select().from(inquiries);

afterEach(() => testDb.delete(inquiries));
afterAll(closeTestDb);

describe("product inquiries and availability", () => {
  it.each(["available", "reserved"] as const)(
    "accepts an inquiry for a %s product",
    async (status) => {
      current.catalog = withStatus(status);
      expect(await submit(productInquiry(randomUUID()))).toEqual({ status: "sent" });
      const rows = await stored();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.productSlug).toBe(SLUG);
      expect(rows[0]?.data).toMatchObject({
        item: expect.stringContaining("Submariner"),
      });
    },
  );

  it.each([
    ["sold", () => withStatus("sold")],
    ["not public", hidden],
  ] as const)(
    "refuses a new inquiry for a %s product and stores nothing",
    async (_, catalog) => {
      current.catalog = catalog();
      const result = await submit(productInquiry(randomUUID()));
      expect(result.status).toBe("unavailable");
      expect(result).toMatchObject({ values: { name: "Ada Lovelace" } });
      expect(await stored()).toHaveLength(0);
    },
  );

  it.each([
    ["sold", () => withStatus("sold")],
    ["no longer public", hidden],
  ] as const)(
    "still answers a replay as sent when the product is now %s",
    async (_, catalog) => {
      const key = randomUUID();
      current.catalog = withStatus("available");
      await submit(productInquiry(key));
      current.catalog = catalog();
      expect(await submit(productInquiry(key))).toEqual({ status: "sent" });
      expect(await stored()).toHaveLength(1);
    },
  );

  it.each([
    ["sold", () => withStatus("sold")],
    ["no longer public", hidden],
  ] as const)(
    "recognises a replay without a client key when the product is now %s",
    async (_, catalog) => {
      current.catalog = withStatus("available");
      await submit(productInquiry());
      current.catalog = catalog();
      expect(await submit(productInquiry())).toEqual({ status: "sent" });
      expect(await stored()).toHaveLength(1);
    },
  );
});
