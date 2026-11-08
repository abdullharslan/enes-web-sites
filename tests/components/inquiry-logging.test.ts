import { DrizzleQueryError } from "drizzle-orm";
import { inspect } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitInquiryAction } from "@/app/actions/inquiries";
import { IDLE_FORM } from "@/lib/forms/state";
import { removeInquiryFiles } from "@/lib/server/inquiries/photos";
import { seedCatalogFixture } from "../fixtures/catalog";

const database = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@/db/client", () => ({ db: database }));
vi.mock("@/lib/server/catalog", () => ({ getCatalog: vi.fn() }));
vi.mock("@/lib/server/request-address", () => ({
  requestAddressBucket: async () => "203.0.113.50",
}));
vi.mock("@/lib/server/inquiries/retention", () => ({ maintainRetention: vi.fn() }));
vi.mock("@/lib/server/inquiries/photos", () => ({
  PRIVATE_ROOT: "/private",
  hasRoomFor: vi.fn(),
  preparePhotos: vi.fn(),
  removeInquiryFiles: vi.fn(),
  writeInquiryPhotos: vi.fn(),
}));
vi.mock("@/lib/server/inquiries/service", () => ({
  hashAddress: () => "hash",
  admitSubmission: async () => "ok",
  deriveSubmissionKey: () => "key",
  recordInquiry: vi.fn(),
}));

const { getCatalog } = await import("@/lib/server/catalog");

const VISITOR = {
  name: "Ada Lovelace",
  phone: "+49 170 1234567",
  email: "ada@example.com",
};

function inquiryForm() {
  const fd = new FormData();
  fd.set("kind", "contact");
  fd.set("locale", "de");
  fd.set("name", VISITOR.name);
  fd.set("phone", VISITOR.phone);
  fd.set("email", VISITOR.email);
  fd.set("message", "Noch verfügbar?");
  return fd;
}

describe("a failed inquiry in the server log", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(seedCatalogFixture());
    database.transaction.mockRejectedValue(
      new DrizzleQueryError(
        "insert into inquiries values ($1, $2, $3)",
        Object.values(VISITOR),
        Object.assign(new Error("duplicate key"), { code: "23505" }),
      ),
    );
    vi.mocked(removeInquiryFiles).mockResolvedValue(undefined);
  });

  it("names the failure without the visitor's data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await submitInquiryAction(IDLE_FORM, inquiryForm());
    expect(state.status).toBe("failed");
    expect(log.mock.calls).toEqual([["Inquiry submission failed", "Error 23505"]]);
    const written = inspect(log.mock.calls, { depth: null });
    for (const value of Object.values(VISITOR)) expect(written).not.toContain(value);
  });

  it("logs a failed file cleanup the same way", async () => {
    vi.mocked(removeInquiryFiles).mockRejectedValue(
      Object.assign(new Error("unlink /private/ada.jpg"), { code: "EACCES" }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await submitInquiryAction(IDLE_FORM, inquiryForm());
    expect(log.mock.calls).toContainEqual([
      "Removing inquiry files failed",
      "Error EACCES",
    ]);
    expect(inspect(log.mock.calls, { depth: null })).not.toContain("ada.jpg");
  });
});
