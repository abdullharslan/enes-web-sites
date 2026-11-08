import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteInquiryAction } from "@/app/admin/actions/inquiries";
import { setUserActiveAction } from "@/app/admin/actions/users";
import { ForbiddenError, requirePermission } from "@/lib/server/auth/current";
import { UserRuleError, setUserActive } from "@/lib/server/auth/users";
import { ErasureNotRecordedError, eraseInquiry } from "@/lib/server/inquiries/erasure";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));
vi.mock("@/db/client", () => ({
  db: { transaction: (run: (tx: object) => unknown) => run({}) },
}));
vi.mock("@/lib/server/auth/current", () => ({
  SESSION_COOKIE: "s",
  ForbiddenError: class ForbiddenError extends Error {},
  requirePermission: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@/lib/server/auth/password", () => ({ passwordProblems: () => [] }));
vi.mock("@/lib/server/auth/permissions", () => ({ ROLES: ["owner", "editor"] }));
vi.mock("@/lib/server/auth/users", () => ({
  UserRuleError: class UserRuleError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
  setUserActive: vi.fn(),
}));
vi.mock("@/lib/server/inquiries/photos", () => ({
  PRIVATE_ROOT: "root",
}));
vi.mock("@/lib/server/inquiries/erasure", () => ({
  ErasureNotRecordedError: class ErasureNotRecordedError extends Error {},
  eraseInquiry: vi.fn(),
}));
vi.mock("@/lib/server/inquiries/service", () => ({
  setInquiryStatus: vi.fn(),
}));

const ID = "11111111-1111-4111-8111-111111111111";
const IDLE = { status: "idle" } as const;
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePermission).mockResolvedValue({ id: "actor" } as never);
});

describe("setUserActiveAction", () => {
  const toggle = form({ userId: ID, active: "false" });

  it("reports a missing permission", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new ForbiddenError("users:manage"));
    expect(await setUserActiveAction(IDLE, toggle)).toEqual({
      status: "error",
      error: "forbidden",
    });
  });

  it("reports invalid input", async () => {
    expect(await setUserActiveAction(IDLE, form({ userId: "x", active: "?" }))).toEqual({
      status: "error",
      error: "invalid",
    });
  });

  it("reports a broken rule", async () => {
    vi.mocked(setUserActive).mockRejectedValue(new UserRuleError("notFound"));
    expect(await setUserActiveAction(IDLE, toggle)).toEqual({
      status: "error",
      error: "notFound",
    });
  });

  it("reports success", async () => {
    vi.mocked(setUserActive).mockResolvedValue(undefined);
    expect(await setUserActiveAction(IDLE, toggle)).toEqual({ status: "ok" });
  });
});

describe("deleteInquiryAction", () => {
  const confirmed = form({ id: ID, confirm: "on" });

  it("says deleted only when a row was deleted", async () => {
    vi.mocked(eraseInquiry).mockResolvedValue(true);
    await expect(deleteInquiryAction(IDLE, confirmed)).rejects.toThrow(
      "REDIRECT /admin/inquiries?deleted=1",
    );
    expect(eraseInquiry).toHaveBeenCalledWith(expect.anything(), "root", "actor", ID);
  });

  it("says already gone when nothing was left to delete", async () => {
    vi.mocked(eraseInquiry).mockResolvedValue(false);
    await expect(deleteInquiryAction(IDLE, confirmed)).rejects.toThrow(
      "REDIRECT /admin/inquiries?deleted=gone",
    );
  });

  it("says so when the erasure could not be recorded", async () => {
    vi.mocked(eraseInquiry).mockRejectedValue(new ErasureNotRecordedError());
    expect(await deleteInquiryAction(IDLE, confirmed)).toEqual({
      status: "error",
      error: "notRecorded",
    });
  });

  it("reports a missing permission and an unconfirmed request", async () => {
    expect(await deleteInquiryAction(IDLE, form({ id: ID }))).toEqual({
      status: "error",
      error: "invalid",
    });
    vi.mocked(requirePermission).mockRejectedValue(new ForbiddenError("users:manage"));
    expect(await deleteInquiryAction(IDLE, confirmed)).toEqual({
      status: "error",
      error: "forbidden",
    });
    expect(eraseInquiry).not.toHaveBeenCalled();
  });
});
