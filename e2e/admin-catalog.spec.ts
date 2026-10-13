import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { accounts, signIn } from "./auth";

const unique = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

async function pngFile(color: string) {
  const buffer = await sharp({
    create: { width: 64, height: 80, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  return { name: "photo.png", mimeType: "image/png", buffer };
}

async function createProduct(page: Page, slug: string, model: string, price: string) {
  await page.goto("/admin/products/new");
  await page.getByLabel("Marka").selectOption({ label: "Rolex" });
  await page.getByLabel("Kategori").selectOption({ label: "Saatler" });
  await page.getByLabel("Model").fill(model);
  await page.getByLabel("Adres (slug)").fill(slug);
  await page.getByLabel("Fiyat (EUR, boş = fiyat sorunuz)").fill(price);
  await page
    .getByRole("group", { name: "Malzeme" })
    .getByLabel("Almanca")
    .fill("Edelstahl");
  await page
    .getByRole("group", { name: "Açıklama" })
    .getByLabel("Almanca")
    .fill("Testobjekt");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?saved=1$/);
  return page.url().match(/products\/([0-9a-f-]{36})/)![1]!;
}

test.describe("admin catalog", () => {
  test("editor creates a brand with an image and it appears on the public site at once", async ({
    page,
  }) => {
    const slug = `maison-${unique()}`;
    await signIn(page, accounts().editor);
    await page.goto("/admin/brands/new");
    await page.getByLabel("Marka adı").fill("Maison Neuve");
    await page.getByLabel("Adres (slug)").fill(slug);
    await page
      .getByRole("group", { name: "Açıklama" })
      .getByLabel("Almanca")
      .fill("Neue Maison im Test");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Kaydedildi (sürüm 1).")).toBeVisible();

    await page
      .getByLabel("Görsel", { exact: true })
      .setInputFiles(await pngFile("#c9a96e"));
    await page.getByRole("button", { name: "Yükle" }).click();
    await expect(page.getByText("Kaydedildi (sürüm 2).")).toBeVisible();
    const imageSrc = await page
      .getByRole("img", { name: "Mevcut görsel" })
      .getAttribute("src");
    expect(decodeURIComponent(imageSrc ?? "")).toMatch(
      new RegExp(`/media/brand/${slug}/\\d{8}-\\d{6}_v1_[a-f0-9]{8}\\.webp`),
    );

    await page.goto(`/de/brands/${slug}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Maison Neuve" }),
    ).toBeVisible();
    await expect(page.getByText("Neue Maison im Test")).toBeVisible();
  });

  test("price change is versioned and can be rolled back", async ({ page }) => {
    const slug = `rolex-test-${unique()}`;
    await signIn(page, accounts().editor);
    const id = await createProduct(page, slug, `Testmodell ${unique()}`, "12000");
    // The product's own price block (related products elsewhere may show prices too).
    const ownPrice = (price: string) => page.locator("article header").getByText(price);

    await page.getByLabel("Fiyat (EUR, boş = fiyat sorunuz)").fill("15500");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Kaydedildi (sürüm 2).")).toBeVisible();

    await page.goto(`/de/collection/${slug}`);
    await expect(ownPrice("15.500 €")).toBeVisible();

    await page.goto(`/admin/history/product/${id}`);
    const v1 = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: /^Sürüm 1/ }) });
    await v1.getByRole("button", { name: "Bu sürüme dön" }).click();
    await expect(page.getByText("v1 geri yüklendi (yeni sürüm olarak).")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Sürüm 3/ })).toBeVisible();

    await page.goto(`/de/collection/${slug}`);
    await expect(ownPrice("12.000 €")).toBeVisible();
  });

  test("a stale edit is refused instead of overwriting someone else's change", async ({
    page,
    browser,
  }) => {
    const slug = `rolex-conflict-${unique()}`;
    await signIn(page, accounts().editor);
    const id = await createProduct(page, slug, `Konflikt ${unique()}`, "9000");

    const other = await browser.newPage();
    await signIn(other, accounts().owner);
    await other.goto(`/admin/products/${id}`);

    await page.getByLabel("Model").fill("Konflikt A");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Kaydedildi (sürüm 2).")).toBeVisible();

    await other.getByLabel("Model").fill("Konflikt B");
    await other.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      other.getByText("başka biri tarafından değiştirildi", { exact: false }),
    ).toBeVisible();
    await expect(other.getByLabel("Model")).toHaveValue("Konflikt B");
    await other.close();
  });

  test("invalid input is rejected with field errors and the typed values survive", async ({
    page,
  }) => {
    await signIn(page, accounts().editor);
    await page.goto("/admin/categories/new");
    await page
      .getByRole("group", { name: "Kategori adı" })
      .getByLabel("Almanca")
      .fill("Gürtel");
    await page.getByLabel("Adres (slug)").fill("Not A Slug!");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      page.getByText("Kaydedilemedi. Lütfen alanları kontrol edin."),
    ).toBeVisible();
    await expect(page.getByLabel("Adres (slug)")).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByRole("group", { name: "Kategori adı" }).getByLabel("Almanca"),
    ).toHaveValue("Gürtel");

    await page.getByLabel("Adres (slug)").fill("bags");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      page.getByText("Bu adres (slug) zaten kullanılıyor.").first(),
    ).toBeVisible();
  });

  test("files that are not images are refused", async ({ page }) => {
    const slug = `rolex-upload-${unique()}`;
    await signIn(page, accounts().editor);
    await createProduct(page, slug, `Upload ${unique()}`, "5000");
    await page.getByLabel("Görsel", { exact: true }).setInputFiles({
      name: "evil.png",
      mimeType: "image/png",
      buffer: Buffer.from("<svg onload=alert(1)></svg>"),
    });
    await page.getByRole("button", { name: "Yükle" }).click();
    await expect(page.getByText("Görsel yüklenemedi.", { exact: false })).toBeVisible();
  });

  test("admin catalog pages are accessible", async ({ page }) => {
    const AxeBuilder = (await import("@axe-core/playwright")).default;
    await signIn(page, accounts().editor);
    for (const path of [
      "/admin/products",
      "/admin/products/new",
      "/admin/brands",
      "/admin/categories",
    ]) {
      await page.goto(path);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      expect(result.violations.map((v) => `${path}: ${v.id}`)).toEqual([]);
    }
  });
});
