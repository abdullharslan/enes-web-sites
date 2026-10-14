import { expect, test, type APIRequestContext } from "@playwright/test";
import { accounts, signIn } from "./auth";
import { closeE2eDb, viewsToday } from "./db";

test.afterAll(closeE2eDb);

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SAME_ORIGIN = { "user-agent": BROWSER_UA, "sec-fetch-site": "same-origin" };

const beacon = (
  request: APIRequestContext,
  path: string,
  headers: Record<string, string> = SAME_ORIGIN,
) => request.post("/api/views", { data: JSON.stringify({ path }), headers });

test.describe("analytics", () => {
  test("a real page visit is counted without setting any cookie", async ({ browser }) => {
    const page = "/collection/patek-philippe-calatrava-5227g";
    const before = await viewsToday("fr", page);
    const context = await browser.newContext();
    const visitor = await context.newPage();
    await visitor.goto(`/fr${page}`);
    await expect.poll(() => viewsToday("fr", page)).toBeGreaterThan(before);
    expect(await context.cookies()).toEqual([]);
    await context.close();
  });

  test("privacy signals, bots, foreign sites and made-up pages are not counted", async ({
    request,
  }) => {
    const page = "/legal/agb";
    const before = await viewsToday("de", page);
    const ignored = [
      { ...SAME_ORIGIN, dnt: "1" },
      { ...SAME_ORIGIN, "sec-gpc": "1" },
      { ...SAME_ORIGIN, "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
      { ...SAME_ORIGIN, "sec-fetch-site": "cross-site" },
    ];
    for (const headers of ignored) {
      const response = await beacon(request, `/de${page}`, headers);
      expect(response.status()).toBe(204);
    }
    expect((await beacon(request, "/de/collection/made-up-product")).status()).toBe(204);
    expect((await beacon(request, "not json at all")).status()).toBe(204);
    expect(await viewsToday("de", page)).toBe(before);

    await beacon(request, `/de${page}`);
    expect(await viewsToday("de", page)).toBe(before + 1);
    expect(await viewsToday("de", "/collection/made-up-product")).toBe(0);
  });

  test("the dashboard shows views, top products and brand interest", async ({
    page,
    request,
  }) => {
    for (let i = 0; i < 30; i++) {
      await beacon(request, "/en/collection/patek-philippe-nautilus-5711");
    }
    await signIn(page, accounts().editor);
    const menu = page.getByRole("navigation", { name: "Yönetim menüsü" });
    await menu.getByRole("link", { name: "Analiz" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Analiz" })).toBeVisible();

    const products = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "En çok bakılan ürünler" }) });
    const row = products.getByRole("row").filter({ hasText: "Patek Philippe Nautilus" });
    const count = Number(await row.getByRole("cell").nth(1).innerText());
    expect(count).toBeGreaterThanOrEqual(30);
    const brands = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /Marka ilgisi/ }) });
    await expect(
      brands.getByRole("row").filter({ hasText: "Patek Philippe" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Son 7 gün" }).click();
    await expect(page.getByRole("link", { name: "Son 7 gün" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const AxeBuilder = (await import("@axe-core/playwright")).default;
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
