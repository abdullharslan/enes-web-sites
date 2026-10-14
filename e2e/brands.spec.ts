import { expect, test, type Page } from "@playwright/test";

const productNames = (page: Page) =>
  page
    .getByRole("list")
    .filter({ has: page.getByRole("article") })
    .getByRole("heading")
    .allInnerTexts();

/** Clicks a sort option and waits for the URL before reading the list (no race). */
async function sortBy(page: Page, label: string, query: string) {
  await page
    .getByRole("group", { name: "Sort by" })
    .getByRole("link", { name: label })
    .click();
  await expect(page).toHaveURL(new RegExp(`\\?sort=${query}$`));
}

test.describe("brand pages", () => {
  test("the brands index links every house to its own page", async ({ page }) => {
    await page.goto("/en/brands");
    await expect(
      page.getByRole("heading", { level: 1, name: "Our Maisons" }),
    ).toBeVisible();
    for (const name of [
      "Hermès",
      "Louis Vuitton",
      "Chanel",
      "Miu Miu",
      "Rolex",
      "Patek Philippe",
      "Van Cleef & Arpels",
    ]) {
      await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    }
    await page.getByRole("link", { name: /Miu Miu/ }).click();
    await expect(page).toHaveURL(/\/en\/brands\/miu-miu$/);
  });

  test("a brand page lists only that brand and has no brand filter", async ({ page }) => {
    await page.goto("/de/brands/rolex");
    await expect(page.getByRole("status")).toHaveText("3 Objekte");
    await expect(page.getByRole("group", { name: "Marke" })).toHaveCount(0);
    expect(await productNames(page)).toEqual([
      "Submariner Date",
      "Datejust 41",
      "Explorer 40",
    ]);
  });

  test("sorting and filtering work without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en/brands/rolex?sort=price-desc");
    expect(await productNames(page)).toEqual([
      "Datejust 41",
      "Submariner Date",
      "Explorer 40",
    ]);
    await page.goto("/fr/collection?category=shoes");
    await expect(page.getByRole("status")).toHaveText("2 pièces");
    await context.close();
  });

  test("sorts A–Z, Z–A, price ascending and descending", async ({ page }) => {
    await page.goto("/en/brands/rolex");

    await sortBy(page, "Name A–Z", "name-asc");
    expect(await productNames(page)).toEqual([
      "Datejust 41",
      "Explorer 40",
      "Submariner Date",
    ]);

    await sortBy(page, "Name Z–A", "name-desc");
    expect(await productNames(page)).toEqual([
      "Submariner Date",
      "Explorer 40",
      "Datejust 41",
    ]);

    await sortBy(page, "Price low to high", "price-asc");
    expect(await productNames(page)).toEqual([
      "Explorer 40",
      "Submariner Date",
      "Datejust 41",
    ]);

    await sortBy(page, "Price high to low", "price-desc");
    expect(await productNames(page)).toEqual([
      "Datejust 41",
      "Submariner Date",
      "Explorer 40",
    ]);
  });

  test("unknown brands return a real 404", async ({ page }) => {
    const response = await page.goto("/de/brands/gucci");
    expect(response?.status()).toBe(404);
  });

  test("new category and brand from the database are browsable", async ({ page }) => {
    await page.goto("/fr/collection?category=shoes");
    await expect(page.getByRole("status")).toHaveText("2 pièces");
    await expect(page.getByRole("heading", { name: "Satin Pumps" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Slingback Pumps" })).toBeVisible();
  });

  test("product pages link back to their brand", async ({ page }) => {
    await page.goto("/fr/collection/miu-miu-satin-pumps");
    await expect(
      page.getByText("Escarpin pointu classique", { exact: false }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Miu Miu" }).first().click();
    await expect(page).toHaveURL(/\/fr\/brands\/miu-miu$/);
  });
});
