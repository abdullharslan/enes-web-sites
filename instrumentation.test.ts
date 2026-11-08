// @vitest-environment node
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

const mocks = vi.hoisted(() => ({
  maintainRetention: vi.fn(async () => {}),
}));

vi.mock("@/db/client", () => ({ db: "the-database" }));
vi.mock("@/lib/server/inquiries/retention", () => ({
  maintainRetention: mocks.maintainRetention,
}));

const HOUR = 60 * 60 * 1000;

function stubServer(overrides: Record<string, string> = {}) {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PHASE", "");
  vi.stubEnv("RETENTION_TIMER", "");
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

describe("register (retention timer)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    mocks.maintainRetention.mockClear();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/server/retention-timer");
  });

  it("applies retention at start and then hourly, without traffic", async () => {
    stubServer();

    await register();
    expect(mocks.maintainRetention).toHaveBeenCalledTimes(1);
    expect(mocks.maintainRetention.mock.calls[0]?.[0 as never]).toBe("the-database");

    vi.advanceTimersByTime(2 * HOUR);
    expect(mocks.maintainRetention).toHaveBeenCalledTimes(3);
  });

  it("does not keep the process alive", async () => {
    stubServer();
    const interval = vi.spyOn(globalThis, "setInterval");

    await register();

    expect(interval.mock.results[0]?.value.hasRef()).toBe(false);
  });

  it.each([
    ["the edge runtime", { NEXT_RUNTIME: "edge" }],
    ["next build", { NEXT_PHASE: "phase-production-build" }],
    ["the dev server", { NODE_ENV: "development" }],
    ["unit and integration tests", { NODE_ENV: "test" }],
    ["the E2E server", { RETENTION_TIMER: "off" }],
  ])("stays off in %s", async (_name, env) => {
    stubServer(env);

    await register();

    expect(mocks.maintainRetention).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never stops the server from starting, and logs no connection details", async () => {
    stubServer();
    vi.doMock("@/lib/server/retention-timer", () => {
      throw new Error("postgres://secret@host/db");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(register()).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
    expect(inspect(log.mock.calls)).not.toContain("secret");
  });
});
