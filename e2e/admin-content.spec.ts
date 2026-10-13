import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { accounts, signIn } from "./auth";

const unique = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

async function pngFile(color: string) {
  const buffer = await sharp({
    create: { width: 120, height: 80, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  return { name: "hero.png", mimeType: "image/png", buffer };
}

/** The version number shown in the "saved" message after a change. */
async function savedVersion(page: Page): Promise<number> {
  const text = await page.getByText(/Kaydedildi \(sürüm \d+\)\./).textContent();
  return Number(text?.match(/sürüm (\d+)/)?.[1]);
}

const heroImageSrc = async (page: Page) =>
  decodeURIComponent(
    (await page
      .locator('section[aria-labelledby="hero-title"] img')
      .getAttribute("src")) ?? "",
  );

test.describe.configure({ mode: "serial" });

test.describe("admin content", () => {
  test("hero image can be replaced and the previous version restored", async ({
    page,
  }) => {
    await page.goto("/de");
    const originalSrc = await heroImageSrc(page);
    expect(originalSrc).toMatch(/\/media\/home\/home-hero\//);

    await signIn(page, accounts().editor);
    await page.goto("/admin/home/home.hero");
    await page.getByLabel("Görsel", { exact: true }).setInputFiles(
      await pngFile(
        `#${Math.floor(Math.random() * 0xffffff)
          .toString(16)
          .padStart(6, "0")}`,
      ),
    );
    await page.getByRole("button", { name: "Yükle" }).click();
    const afterUpload = await savedVersion(page);

    await page.goto("/de");
    const newSrc = await heroImageSrc(page);
    expect(newSrc).not.toBe(originalSrc);
    expect(newSrc).toMatch(
      /\/media\/home\/home-hero\/\d{8}-\d{6}_v\d+_[a-f0-9]{8}\.webp/,
    );

    await page.goto("/admin/history/content/home.hero");
    const previous = page.getByRole("listitem").filter({
      has: page.getByRole("heading", {
        name: new RegExp(`^Sürüm ${afterUpload - 1}\\b`),
      }),
    });
    await previous.getByRole("button", { name: "Bu sürüme dön" }).click();
    await expect(
      page.getByText(`v${afterUpload - 1} geri yüklendi (yeni sürüm olarak).`),
    ).toBeVisible();

    await page.goto("/de");
    expect(await heroImageSrc(page)).toBe(originalSrc);
  });

  test("hero title is editable per language", async ({ page }) => {
    const title = `Neue Saison ${unique()}`;
    await signIn(page, accounts().editor);
    await page.goto("/admin/home/home.hero");
    const titleGroup = page.getByRole("group", { name: "Başlık" });
    const originalTr = await titleGroup.getByLabel("Türkçe").inputValue();
    await titleGroup.getByLabel("Almanca").fill(title);
    await page.getByRole("button", { name: "Kaydet" }).click();
    await savedVersion(page);

    await page.goto("/de");
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await page.goto("/tr");
    await expect(page.getByRole("heading", { level: 1, name: originalTr })).toBeVisible();
  });

  test("contact details are validated and shown in the footer", async ({ page }) => {
    await signIn(page, accounts().editor);
    await page.goto("/admin/home/site.contact");
    await page.getByLabel("E-posta").fill("not-an-email");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      page.getByText("Kaydedilemedi. Lütfen alanları kontrol edin."),
    ).toBeVisible();
    await expect(page.getByLabel("E-posta")).toHaveValue("not-an-email");

    const email = `atelier-${unique()}@example.com`;
    await page.getByLabel("E-posta").fill(email);
    await page.getByRole("button", { name: "Kaydet" }).click();
    await savedVersion(page);

    await page.goto("/en/contact");
    await expect(
      page.locator("footer").getByRole("link", { name: email }),
    ).toHaveAttribute("href", `mailto:${email}`);
  });

  test("a new journal article appears on the public journal", async ({ page }) => {
    const title = `Uhrenpflege ${unique()}`;
    await signIn(page, accounts().editor);
    await page.goto("/admin/journal/new");
    await page.getByLabel("Adres (slug)").fill(`artikel-${unique()}`);
    await page.getByLabel("Yayın tarihi").fill("2026-10-14");
    await page.getByRole("group", { name: "Başlık" }).getByLabel("Almanca").fill(title);
    await page
      .getByRole("group", { name: "Özet" })
      .getByLabel("Almanca")
      .fill("Ein kurzer Ratgeber.");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await savedVersion(page);

    await page.goto("/de/journal");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test("the media library lists versioned files; the audit log is owner-only", async ({
    page,
    browser,
  }) => {
    await signIn(page, accounts().editor);
    await page.goto("/admin/media");
    await expect(
      page.getByText(/home\/home-hero\/\d{8}-\d{6}_v1_[a-f0-9]{8}\.webp/),
    ).toBeVisible();
    await page.goto("/admin/audit");
    await expect(
      page.getByRole("alert").filter({ hasText: "yetkiniz yok" }),
    ).toBeVisible();

    const ownerPage = await browser.newPage();
    await signIn(ownerPage, accounts().owner);
    await ownerPage.goto("/admin/audit");
    await expect(
      ownerPage.getByRole("cell", { name: /content\.updated/ }).first(),
    ).toBeVisible();
    await ownerPage.close();
  });

  test("content admin pages are accessible", async ({ page }) => {
    const AxeBuilder = (await import("@axe-core/playwright")).default;
    await signIn(page, accounts().owner);
    for (const path of [
      "/admin/home",
      "/admin/home/home.hero",
      "/admin/journal",
      "/admin/media",
      "/admin/audit",
      "/admin/history/content/home.hero",
    ]) {
      await page.goto(path);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      expect(result.violations.map((v) => `${path}: ${v.id}`)).toEqual([]);
    }
  });
});
