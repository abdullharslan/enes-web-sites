import { expect, test } from "@playwright/test";

test.describe("enquiry form", () => {
  test("rejects empty and malformed input without leaving the page", async ({ page }) => {
    await page.goto("/en/contact");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Please check the highlighted fields.")).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await page.getByLabel("Name", { exact: true }).fill("Ada");
    await page.getByLabel("E-mail", { exact: true }).fill("not-an-email");
    await page.getByLabel("Message", { exact: true }).fill("x".repeat(2001));
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel("E-mail", { exact: true })).toHaveAccessibleDescription(
      "Please enter a valid e-mail address.",
    );
    await expect(page.getByLabel("Message", { exact: true })).toHaveAccessibleDescription(
      "The text is too long.",
    );
    await expect(page).toHaveURL(/\/en\/contact$/);
  });

  test("confirms the hand-off to the mail client on valid input", async ({ page }) => {
    // The mailto: URL itself is asserted in tests/components/forms.test.tsx;
    // headless Chromium cannot observe external-protocol navigations.
    await page.goto("/de/collection/rolex-explorer-224270");
    await page.getByLabel("Name", { exact: true }).fill("Ada Lovelace");
    await page.getByLabel("E-Mail", { exact: true }).fill("ada@example.com");
    await page
      .getByLabel("Nachricht", { exact: true })
      .fill("Ist die Uhr noch verfügbar?");
    await page.getByRole("button", { name: "Absenden" }).click();

    await expect(
      page.getByText("Ihr E-Mail-Programm wurde geöffnet.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("E-Mail", { exact: true })).not.toHaveAttribute(
      "aria-invalid",
    );
  });
});

test.describe("consignment form", () => {
  test("requires item details and validates the year boundary", async ({ page }) => {
    await page.goto("/de/sell");
    await page.getByLabel(/Kaufjahr/).fill("1899");
    await page.getByRole("button", { name: "Absenden" }).click();
    await expect(page.getByLabel("Marke", { exact: true })).toBeFocused();
    await expect(page.getByLabel(/Kaufjahr/)).toHaveAccessibleDescription(
      "Bitte geben Sie ein gültiges Jahr ein.",
    );
  });
});
