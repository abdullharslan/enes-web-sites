import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "./form-state";
import { refreshOnConflict } from "./run-change";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/server/auth/current", () => ({
  ForbiddenError: class extends Error {},
  requirePermission: vi.fn(),
}));
vi.mock("@/lib/server/media/store", () => ({
  MediaRejectedError: class extends Error {},
  prepareImage: vi.fn(),
}));

const PATH = "/admin/brands/1";

describe("refreshOnConflict", () => {
  beforeEach(() => vi.clearAllMocks());

  it("brings an outdated page up to date and keeps the typed values", () => {
    const state: FormState = {
      status: "error",
      error: "conflict",
      values: { name: "Mine" },
    };
    expect(refreshOnConflict(PATH, state)).toBe(state);
    expect(revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("leaves the page alone on any other failure", () => {
    const state: FormState = { status: "error", error: "invalid" };
    expect(refreshOnConflict(PATH, state)).toBe(state);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
