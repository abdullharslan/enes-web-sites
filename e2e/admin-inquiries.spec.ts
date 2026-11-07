import { expect, test, type Page } from "@playwright/test";
import { accounts, signIn } from "./auth";
import { pngFile } from "./files";

const unique = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const SUCCESS_DE = "Vielen Dank – Ihre Anfrage ist bei uns eingegangen.";

async function fillContact(page: Page, name: string, message: string) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("E-Mail", { exact: true }).fill("ada@example.com");
  await page.getByLabel("Nachricht", { exact: true }).fill(message);
}

/** Opens the inquiry sent by `name` from the "all" view of the inbox. */
async function openInquiry(page: Page, name: string) {
  await page.goto("/admin/inquiries?status=all");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/inquiries\/[0-9a-f-]{36}$/);
}

test.describe("inquiries", () => {
  test("a product question reaches the inbox and is handled by staff", async ({
    page,
    browser,
  }) => {
    const name = `Ada ${unique()}`;
    const visitor = await browser.newPage();
    await visitor.goto("/de/collection/rolex-explorer-224270");
    await fillContact(visitor, name, "Ist die Uhr noch verfügbar?");
    await visitor.getByRole("button", { name: "Absenden" }).click();
    await expect(visitor.getByText(SUCCESS_DE, { exact: false })).toBeVisible();
    // Personal data never ends up in the URL, and the form is cleared for the next request.
    await expect(visitor).toHaveURL(/\/de\/collection\/rolex-explorer-224270$/);
    await expect(visitor.getByLabel("Name", { exact: true })).toHaveValue("");
    await visitor.close();

    await signIn(page, accounts().editor);
    const menu = page.getByRole("navigation", { name: "Yönetim menüsü" });
    await expect(menu.getByRole("link", { name: /Talepler.*yeni/ })).toBeVisible();

    await page.goto("/admin/inquiries");
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Ürün sorusu");
    await expect(row).toContainText("Rolex Explorer 40 224270");
    await row.getByRole("link", { name }).click();

    // Role queries skip the previous page, which Next keeps mounted but hidden.
    await expect(
      page.getByRole("definition").filter({ hasText: "Ist die Uhr noch verfügbar?" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "E-posta ile yanıtla" })).toHaveAttribute(
      "href",
      "mailto:ada@example.com",
    );
    await page.getByRole("combobox", { name: "Durum" }).selectOption("in_progress");
    await page.getByRole("button", { name: "Durumu kaydet" }).click();
    await expect(page.getByText("Durum güncellendi.")).toBeVisible();

    await page.goto("/admin/inquiries?status=in_progress");
    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
    await page.goto("/admin/inquiries?status=new");
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
  });

  test("consignment photos stay private and are deleted with the inquiry", async ({
    page,
    browser,
  }) => {
    const name = `Grace ${unique()}`;
    const visitor = await browser.newPage();
    await visitor.goto("/de/sell");
    await visitor.getByLabel("Marke", { exact: true }).selectOption("rolex");
    await visitor.getByLabel("Kategorie", { exact: true }).selectOption("watches");
    await visitor.getByLabel("Modell / Bezeichnung", { exact: true }).fill("Daytona");
    await visitor.getByLabel("Zustand", { exact: true }).selectOption("excellent");
    await visitor.getByLabel("Box", { exact: true }).check();
    await visitor.getByLabel("Name", { exact: true }).fill(name);
    await visitor.getByLabel("E-Mail", { exact: true }).fill("grace@example.com");
    await visitor
      .getByLabel(/^Fotos/)
      .setInputFiles([
        await pngFile("#202020", "front.png"),
        await pngFile("#c9a96e", "back.png"),
      ]);
    await visitor.getByRole("button", { name: "Absenden" }).click();
    await expect(visitor.getByText(SUCCESS_DE, { exact: false })).toBeVisible();

    await signIn(page, accounts().editor);
    await openInquiry(page, name);
    // Codes are shown in the admin's language (Turkish).
    await expect(
      page.getByRole("definition").filter({ hasText: "Mükemmel" }),
    ).toBeVisible();
    await expect(
      page.getByRole("definition").filter({ hasText: /^Kutu$/ }),
    ).toBeVisible();
    const images = page.getByRole("img", { name: /Gönderilen fotoğraf/ });
    await expect(images).toHaveCount(2);
    for (const image of await images.all()) {
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
    }
    const photoUrl = await images.first().getAttribute("src");
    expect(photoUrl).toMatch(/^\/admin\/inquiries\/photos\/[0-9a-f-]{36}$/);

    // Without a session the photo is not served, and it never sits under /media.
    const anonymous = await browser.newContext();
    const denied = await anonymous.request.get(photoUrl!);
    expect(denied.status()).toBe(401);
    await anonymous.close();
    const allowed = await page.request.get(photoUrl!);
    expect(allowed.status()).toBe(200);
    expect(allowed.headers()["cache-control"]).toBe("private, no-store");
    expect(allowed.headers()["content-type"]).toBe("image/webp");

    // Deletion needs the confirmation box, then removes inquiry and photos.
    const inquiryUrl = page.url();
    await page.getByRole("button", { name: "Talebi kalıcı olarak sil" }).click();
    await expect(page).toHaveURL(inquiryUrl);
    await page.getByLabel("Silmeyi onaylıyorum (geri alınamaz)").check();
    await page.getByRole("button", { name: "Talebi kalıcı olarak sil" }).click();
    await expect(page.getByRole("status")).toHaveText("Talep silindi.");
    expect((await page.request.get(photoUrl!)).status()).toBe(404);
    // Admin pages stream after the session check, so the status stays 200 (only
    // staff ever see it); what matters is that the inquiry is gone.
    await page.goto(inquiryUrl);
    await expect(
      page.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
  });

  test("the contact form works without JavaScript", async ({ page, browser }) => {
    const name = `NoScript ${unique()}`;
    const context = await browser.newContext({ javaScriptEnabled: false });
    const visitor = await context.newPage();
    await visitor.goto("/de/contact");
    // Sent twice (a re-sent form, a double click before the page answers): stored once.
    for (let attempt = 0; attempt < 2; attempt++) {
      await visitor.goto("/de/contact");
      await fillContact(visitor, name, "Gesendet ohne JavaScript");
      await visitor.getByRole("button", { name: "Absenden" }).click();
      await expect(visitor.getByText(SUCCESS_DE, { exact: false })).toBeVisible();
      expect(new URL(visitor.url()).search).toBe("");
    }

    // Server-side validation answers too, and keeps what was typed.
    await visitor.goto("/de/contact");
    await visitor.getByLabel("Name", { exact: true }).fill("Ohne Mail");
    await visitor.getByRole("button", { name: "Absenden" }).click();
    await expect(visitor.getByLabel("E-Mail", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(visitor.getByLabel("Name", { exact: true })).toHaveValue("Ohne Mail");
    await context.close();

    await signIn(page, accounts().editor);
    await page.goto("/admin/inquiries?status=all");
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(1);
    await openInquiry(page, name);
    await expect(
      page.getByRole("definition").filter({ hasText: "Gesendet ohne JavaScript" }),
    ).toBeVisible();
  });

  test("bots that fill the hidden field are answered but not stored", async ({
    page,
    browser,
  }) => {
    const name = `Bot ${unique()}`;
    const visitor = await browser.newPage();
    await visitor.goto("/en/contact");
    await visitor.getByLabel("Name", { exact: true }).fill(name);
    await visitor.getByLabel("E-mail", { exact: true }).fill("bot@example.com");
    await visitor.getByLabel("Message", { exact: true }).fill("Buy cheap watches");
    await visitor.locator('input[name="website"]').evaluate((input: HTMLInputElement) => {
      input.value = "https://spam.example";
    });
    await visitor.getByRole("button", { name: "Send" }).click();
    await expect(
      visitor.getByText("Thank you – we have received your request", { exact: false }),
    ).toBeVisible();
    await visitor.close();

    await signIn(page, accounts().editor);
    await page.goto("/admin/inquiries?status=all");
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  });

  test("inbox pages are accessible", async ({ page, browser }) => {
    const name = `Axe ${unique()}`;
    const visitor = await browser.newPage();
    await visitor.goto("/de/contact");
    await fillContact(visitor, name, "Barrierefreiheit");
    await visitor.getByRole("button", { name: "Absenden" }).click();
    await expect(visitor.getByText(SUCCESS_DE, { exact: false })).toBeVisible();
    await visitor.close();

    const AxeBuilder = (await import("@axe-core/playwright")).default;
    await signIn(page, accounts().editor);
    await page.goto("/admin/inquiries?status=all");
    const scan = async () =>
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
          .analyze()
      ).violations.map((v) => v.id);
    expect(await scan()).toEqual([]);
    await openInquiry(page, name);
    expect(await scan()).toEqual([]);
  });
});
