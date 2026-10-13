import { expect, test } from "@playwright/test";

test.describe("SEO", () => {
  test("each page declares its own canonical and hreflang alternates", async ({
    page,
  }) => {
    await page.goto("/de/collection/rolex-explorer-224270");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/de\/collection\/rolex-explorer-224270$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="en-GB"]')).toHaveAttribute(
      "href",
      /\/en\/collection\/rolex-explorer-224270$/,
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "Maison Vault",
    );
  });

  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    test(`${path} is served`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
    });
  }
});

test.describe("privacy without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the enquiry form cannot be submitted natively, so no data reaches the URL", async ({
    page,
  }) => {
    await page.goto("/en/contact");
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await page.getByLabel("Name", { exact: true }).fill("Ada");
    await page.getByLabel("E-mail", { exact: true }).fill("ada@example.com");
    await page.getByLabel("E-mail", { exact: true }).press("Enter");
    await expect(page).toHaveURL(/\/en\/contact$/);
  });
});

test("language switch keeps collection filters", async ({ page }) => {
  await page.goto("/de/collection?brand=rolex&sort=price-asc");
  await page
    .getByRole("navigation", { name: "Sprache" })
    .getByRole("link", { name: "en" })
    .click();
  await expect(page).toHaveURL(/\/en\/collection\?brand=rolex&sort=price-asc$/);
});

test("result count uses singular and plural forms", async ({ page }) => {
  await page.goto("/en/collection?brand=chanel&category=jewellery");
  await expect(page.getByRole("status")).toHaveText("1 item");
  await page.goto("/en/collection?brand=rolex");
  await expect(page.getByRole("status")).toHaveText("3 items");
});

test("menu button reports its expanded state", async ({ page }) => {
  await page.goto("/en");
  const button = page.getByRole("button", { name: "Open menu" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

test("focused elements are not hidden under the fixed header (WCAG 2.4.11)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/de/collection");
  await page.keyboard.press("End");
  // Walk focus backwards from the end of the page; every focused element must clear the header.
  await page.locator("footer a").last().focus();
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press("Shift+Tab");
    const top = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el.closest("header")) return null;
      return el.getBoundingClientRect().top;
    });
    if (top !== null) expect(top).toBeGreaterThanOrEqual(80);
  }
});
