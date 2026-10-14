import { expect, test } from "@playwright/test";

test.describe("site search", () => {
  test("is reachable from the header on phones and desktops", async ({ page }) => {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/en");
      await page
        .getByRole("banner")
        .getByRole("link", { name: "Search", exact: true })
        .click();
      await expect(page).toHaveURL(/\/en\/search$/);
    }
  });

  test("finds products by brand, model and reference", async ({ page }) => {
    await page.goto("/de/search");
    await page.getByLabel("Suchbegriff").fill("rolex submariner");
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(page).toHaveURL(/\/de\/search\?q=rolex\+submariner$/);
    await expect(page.getByRole("status")).toHaveText(
      "1 Ergebnis für „rolex submariner“",
    );
    await expect(page.getByRole("heading", { name: "Submariner Date" })).toBeVisible();
  });

  test("works without JavaScript and folds Turkish characters", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/tr/search?q=AYAKKABILAR");
    await expect(page.getByRole("status")).toContainText("2 sonuç");
    await context.close();
  });

  test("shows a helpful message when nothing matches", async ({ page }) => {
    await page.goto("/fr/search?q=lamborghini");
    await expect(page.getByRole("status")).toHaveText(
      /Aucun résultat pour « lamborghini »/,
    );
    await expect(page.getByRole("link", { name: "Contact" }).first()).toBeVisible();
  });
});
