import { beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "@/app/admin/actions/auth";
import {
  InactiveAccountError,
  authenticate,
  createSession,
} from "@/lib/server/auth/service";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/server/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/server/auth/current", () => ({ SESSION_COOKIE: "s", DEVICE_COOKIE: "d" }));
vi.mock("@/lib/server/request-address", () => ({
  requestAddressBucket: async () => "bucket",
}));
vi.mock("@/lib/server/auth/service", () => ({
  TRUSTED_DEVICE_TTL_MS: 1000,
  InactiveAccountError: class InactiveAccountError extends Error {},
  authenticate: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  validateSession: vi.fn(),
}));

const credentials = () => {
  const fd = new FormData();
  fd.set("email", "editor@example.com");
  fd.set("password", "a long enough passphrase");
  return fd;
};

describe("login", () => {
  beforeEach(() => {
    cookieStore.set.mockReset();
    vi.mocked(authenticate).mockResolvedValue({
      ok: true,
      user: { id: "u1", email: "e@example.com", name: "E", role: "editor" },
      deviceToken: "device",
    });
  });

  it("answers like a wrong password when the account was deactivated meanwhile", async () => {
    vi.mocked(createSession).mockRejectedValue(new InactiveAccountError());
    expect(await login({}, credentials())).toEqual({ error: "invalid" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("does not hide unexpected failures", async () => {
    vi.mocked(createSession).mockRejectedValue(new Error("database down"));
    await expect(login({}, credentials())).rejects.toThrow("database down");
  });
});
