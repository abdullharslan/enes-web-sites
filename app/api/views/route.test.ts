import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordView } from "@/lib/server/analytics/service";
import { getCatalog } from "@/lib/server/catalog";
import { POST } from "./route";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/server/analytics/service", () => ({ recordView: vi.fn() }));
vi.mock("@/lib/server/catalog", () => ({ getCatalog: vi.fn() }));
vi.mock("@/lib/server/request-address", () => ({
  requestAddressBucket: async () => "address-bucket",
}));

const CATALOG = { products: [], brands: [] } as unknown as Awaited<
  ReturnType<typeof getCatalog>
>;

const beacon = () =>
  new Request("http://localhost/api/views", {
    method: "POST",
    headers: { "user-agent": "Mozilla/5.0", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ path: "/de/sell" }),
  });

/** Everything that reached the log, as text. */
const logged = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.flat().map(String).join(" ");

describe("POST /api/views", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(CATALOG);
    vi.mocked(recordView).mockResolvedValue(undefined);
  });

  it("counts a view", async () => {
    expect((await POST(beacon())).status).toBe(204);
    expect(recordView).toHaveBeenCalledOnce();
  });

  it.each([
    ["recording", () => vi.mocked(recordView)],
    ["loading the catalog", () => vi.mocked(getCatalog)],
  ])(
    "answers normally when %s fails, logging only the kind of error",
    async (_, mock) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mock().mockRejectedValue(
        Object.assign(new TypeError("failed for /de/sell"), { query: "SELECT secret" }),
      );

      expect((await POST(beacon())).status).toBe(204);

      expect(log).toHaveBeenCalledOnce();
      expect(logged(log)).toContain("TypeError");
      expect(logged(log)).not.toContain("/de/sell");
    },
  );
});
