import { expect, test } from "@playwright/test";

test.describe("locale routing", () => {
  test("redirects the root to the visitor's preferred supported language", async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: "tr-TR" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/tr$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "tr-TR");
    await context.close();
  });

  test("falls back to German for unsupported languages", async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/collection");
    await expect(page).toHaveURL(/\/de\/collection$/);
    await context.close();
  });

  test("language switcher keeps the current page", async ({ page }) => {
    await page.goto("/de/collection/rolex-explorer-224270");
    await page
      .getByRole("navigation", { name: "Sprache" })
      .getByRole("link", { name: "en" })
      .click();
    await expect(page).toHaveURL(/\/en\/collection\/rolex-explorer-224270$/);
    await expect(
      page.getByRole("link", { name: "Back to the collection" }),
    ).toBeVisible();
  });
});

test.describe("browsing flow", () => {
  test("home → brand → product → WhatsApp enquiry", async ({ page }) => {
    await page.goto("/de");
    await expect(
      page.getByRole("heading", { level: 1, name: "Taschen, Uhren & Schmuck" }),
    ).toBeVisible();

    await page
      .getByRole("region", { name: "Wählen Sie eine Marke" })
      .getByRole("link", { name: "Rolex" })
      .click();
    await expect(page).toHaveURL(/\/de\/collection\?brand=rolex$/);
    await expect(page.getByRole("status")).toHaveText("3 Objekte");

    await page.getByRole("link", { name: /Submariner Date/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Submariner Date" }),
    ).toBeVisible();

    const whatsapp = page.getByRole("link", { name: "Per WhatsApp anfragen" });
    const href = await whatsapp.getAttribute("href");
    expect(href).toBe(
      `https://wa.me/447700900123?text=${encodeURIComponent("Guten Tag, ich interessiere mich für Rolex Submariner Date 126610LN.")}`,
    );
    await expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("filters combine and can be reset", async ({ page }) => {
    await page.goto("/en/collection");
    const filters = page.getByRole("navigation", { name: "Filters" });
    await filters.getByRole("link", { name: "Bags" }).click();
    await expect(page).toHaveURL(/category=bags/);
    await filters.getByRole("link", { name: "Incl. sold" }).click();
    await expect(page).toHaveURL(/category=bags&availability=all/);
    await expect(page.getByText("Sold").first()).toBeVisible();
    await filters.getByRole("link", { name: "Reset filters" }).click();
    await expect(page).toHaveURL(/\/en\/collection$/);
  });

  test("invalid filter values fail closed to defaults", async ({ page }) => {
    await page.goto("/en/collection?brand=gucci&category=cars&sort=random");
    await expect(page.getByRole("link", { name: "All brands" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByRole("link", { name: "Newest first" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("sold items show a notice instead of purchase actions", async ({ page }) => {
    await page.goto("/en/collection/chanel-wallet-on-chain");
    await expect(
      page.getByText("This item has already been sold.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Enquire via WhatsApp" })).toHaveCount(0);
  });
});

test.describe("menu", () => {
  test("opens as a modal dialog and closes with Escape", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Main navigation" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Collection" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("navigates and closes", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Sell" }).click();
    await expect(page).toHaveURL(/\/en\/sell$/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("error handling", () => {
  for (const path of [
    "/de/collection/not-a-product",
    "/en/legal/unknown",
    "/tr/does/not/exist",
  ]) {
    test(`returns a real 404 for ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByText("404")).toBeVisible();
    });
  }
});

test.describe("security headers", () => {
  test("are sent on pages", async ({ request }) => {
    const response = await request.get("/de");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
