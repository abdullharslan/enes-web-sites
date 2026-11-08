// @vitest-environment node
import { DrizzleQueryError } from "drizzle-orm";
import { redirect } from "next/navigation";
import { inspect } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, logout } from "@/app/admin/actions/auth";
import {
  deleteInquiryAction,
  setInquiryStatusAction,
} from "@/app/admin/actions/inquiries";
import {
  changeOwnPasswordAction,
  changeUserRoleAction,
  createUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
} from "@/app/admin/actions/users";
import { prepareUpload, runAdminChange } from "@/lib/admin/run-change";
import { requirePermission, requireUser } from "@/lib/server/auth/current";
import { authenticate, createSession, validateSession } from "@/lib/server/auth/service";
import { eraseInquiry } from "@/lib/server/inquiries/erasure";
import { prepareImage } from "@/lib/server/media/store";

const database = vi.hoisted(() => ({ transaction: vi.fn() }));
const cookieStore = vi.hoisted(() => ({
  get: vi.fn(() => ({ value: "session-token" })),
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("@/db/client", () => ({ db: database }));
vi.mock("@/lib/server/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/server/request-address", () => ({
  requestAddressBucket: async () => "bucket",
}));
vi.mock("@/lib/server/auth/current", () => ({
  SESSION_COOKIE: "s",
  DEVICE_COOKIE: "d",
  ForbiddenError: class ForbiddenError extends Error {},
  requirePermission: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@/lib/server/auth/password", () => ({ passwordProblems: () => [] }));
vi.mock("@/lib/server/auth/permissions", () => ({ ROLES: ["owner", "editor"] }));
vi.mock("@/lib/server/auth/service", () => ({
  TRUSTED_DEVICE_TTL_MS: 1000,
  InactiveAccountError: class InactiveAccountError extends Error {},
  authenticate: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  validateSession: vi.fn(),
}));
vi.mock("@/lib/server/auth/users", () => ({
  UserRuleError: class UserRuleError extends Error {},
  changeOwnPassword: vi.fn(),
  changeUserRole: vi.fn(),
  createUserAsOwner: vi.fn(),
  resetUserPassword: vi.fn(),
  setUserActive: vi.fn(),
}));
vi.mock("@/lib/server/inquiries/photos", () => ({ PRIVATE_ROOT: "root" }));
vi.mock("@/lib/server/inquiries/erasure", () => ({
  ErasureNotRecordedError: class ErasureNotRecordedError extends Error {},
  eraseInquiry: vi.fn(),
}));
vi.mock("@/lib/server/inquiries/service", () => ({ setInquiryStatus: vi.fn() }));
vi.mock("@/lib/server/media/store", () => ({
  MediaRejectedError: class MediaRejectedError extends Error {},
  prepareImage: vi.fn(),
}));

const SECRETS = ["ada@example.com", "Ada Lovelace", "$argon2id$v=19$hash"];
const failedQuery = (code = "08006") =>
  new DrizzleQueryError(
    "insert into users values ($1, $2, $3)",
    SECRETS,
    Object.assign(new Error(`Key (email)=(${SECRETS[0]}) exists`), { code }),
  );
const redirectToLogin = () => {
  try {
    redirect("/admin/login");
  } catch (error) {
    return error;
  }
};

const ID = "11111111-1111-4111-8111-111111111111";
const IDLE = { status: "idle" } as const;
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
};
const credentials = () =>
  form({ email: "ada@example.com", password: "a long enough passphrase" });
const upload = () => {
  const fd = form({});
  fd.set("image", new File(["bytes"], "photo.jpg"));
  return fd;
};

const createUser = () =>
  createUserAction(
    IDLE,
    form({
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "editor",
      password: "a long enough passphrase",
    }),
  );
const setActive = () => setUserActiveAction(IDLE, form({ userId: ID, active: "false" }));
const changeRole = () => changeUserRoleAction(IDLE, form({ userId: ID, role: "editor" }));
const resetPassword = () =>
  resetUserPasswordAction(IDLE, form({ userId: ID, password: "a long passphrase" }));
const changeOwn = () =>
  changeOwnPasswordAction(
    IDLE,
    form({ currentPassword: "old", newPassword: "new", confirmPassword: "new" }),
  );
const setStatus = () => setInquiryStatusAction(IDLE, form({ id: ID, status: "new" }));
const eraseOne = () => deleteInquiryAction(IDLE, form({ id: ID, confirm: "on" }));
const adminChange = () =>
  runAdminChange(form({}), ["content:write"], [], async () => {
    throw new Error("unreachable");
  });

const rejectQuery = () => database.transaction.mockRejectedValue(failedQuery());
const rejectPermission = () =>
  vi.mocked(requirePermission).mockRejectedValue(failedQuery());
const rejectSession = () => vi.mocked(requireUser).mockRejectedValue(failedQuery());

async function rejectionOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to reject");
}

beforeEach(() => {
  vi.clearAllMocks();
  database.transaction.mockReset();
  vi.mocked(requirePermission).mockResolvedValue({ id: "actor" } as never);
  vi.mocked(requireUser).mockResolvedValue({ id: "actor" } as never);
  vi.mocked(authenticate).mockResolvedValue({
    ok: true,
    user: { id: "u1", email: "e@example.com", name: "E", role: "editor" },
    deviceToken: "device",
    credential: "verified",
  });
  vi.mocked(createSession).mockResolvedValue({
    token: "t",
    expiresAt: new Date("2026-11-09T00:00:00Z"),
  });
  vi.mocked(validateSession).mockResolvedValue(null);
});

describe("an unexpected failure of a server action", () => {
  it.each<[string, () => void, () => Promise<unknown>]>([
    ["creating a user", rejectQuery, createUser],
    ["the user admin permission check", rejectPermission, setActive],
    ["deactivating a user", rejectQuery, setActive],
    ["changing a role", rejectQuery, changeRole],
    ["resetting a password", rejectQuery, resetPassword],
    ["changing the own password", rejectQuery, changeOwn],
    ["the session check before a password change", rejectSession, changeOwn],
    ["the inquiry permission check", rejectPermission, setStatus],
    ["setting an inquiry status", rejectQuery, setStatus],
    [
      "erasing an inquiry",
      () => vi.mocked(eraseInquiry).mockRejectedValue(failedQuery()),
      eraseOne,
    ],
    [
      "signing in",
      () => vi.mocked(authenticate).mockRejectedValue(failedQuery()),
      () => login({}, credentials()),
    ],
    [
      "starting the session",
      () => vi.mocked(createSession).mockRejectedValue(failedQuery()),
      () => login({}, credentials()),
    ],
    [
      "signing out",
      () => vi.mocked(validateSession).mockRejectedValue(failedQuery()),
      logout,
    ],
    ["an admin change", rejectQuery, adminChange],
    ["the admin change permission check", rejectPermission, adminChange],
    [
      "the upload permission check",
      rejectPermission,
      () => prepareUpload(upload(), ["media:write"]),
    ],
    [
      "preparing an upload",
      () => vi.mocked(prepareImage).mockRejectedValue(failedQuery()),
      () => prepareUpload(upload(), ["media:write"]),
    ],
  ])("is logged and rethrown without its parameters: %s", async (_name, arrange, run) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    arrange();

    const thrown = await rejectionOf(run);

    expect(thrown).not.toBeInstanceOf(DrizzleQueryError);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]).toContain("Error 08006");
    const visible = inspect([thrown, log.mock.calls], { depth: 10, showHidden: true });
    for (const secret of SECRETS) expect(visible).not.toContain(secret);
  });
});

describe("a save that loses a race for a unique value", () => {
  it("is a conflict for the form, not a crash", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    database.transaction.mockRejectedValue(failedQuery("23505"));

    const result = await adminChange();

    expect(result).toMatchObject({ state: { status: "error", error: "conflict" } });
    expect(log).not.toHaveBeenCalled();
  });
});

describe("a redirect from a server action", () => {
  const signedOut = () => {
    const error = redirectToLogin();
    vi.mocked(requirePermission).mockRejectedValue(error);
    vi.mocked(requireUser).mockRejectedValue(error);
    return error;
  };

  it.each<[string, () => Promise<unknown>]>([
    ["the user admin", setActive],
    ["the own password form", changeOwn],
    ["the inquiry admin", setStatus],
    ["an admin change", adminChange],
    ["an upload", () => prepareUpload(upload(), ["media:write"])],
  ])("reaches Next unchanged when signed out: %s", async (_name, run) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = signedOut();
    await expect(run()).rejects.toBe(error);
    expect(log).not.toHaveBeenCalled();
  });

  it("sends a successful sign-in to the admin after setting its cookies", async () => {
    await expect(login({}, credentials())).rejects.toMatchObject({
      digest: expect.stringContaining(";/admin;"),
    });
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });

  it("sends a sign-out to the login page", async () => {
    await expect(logout()).rejects.toMatchObject({
      digest: expect.stringContaining(";/admin/login;"),
    });
    expect(cookieStore.delete).toHaveBeenCalledWith("s");
  });
});
