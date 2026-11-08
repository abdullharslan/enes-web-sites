import { expect, test, type Page } from "@playwright/test";
import { accounts, signIn } from "./auth";
import { pngFile } from "./files";

const unique = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

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

    // Saving again without the confirmation stays refused: nothing is overwritten.
    await other.getByRole("button", { name: "Kaydet" }).click();
    await page.reload();
    await expect(page.getByLabel("Model")).toHaveValue("Konflikt A");

    // A further change while the warning is open is refused once more.
    await page.getByLabel("Model").fill("Konflikt C");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Kaydedildi (sürüm 3).")).toBeVisible();
    const confirm = other.getByLabel("üzerine yazılacağını", { exact: false });
    await confirm.check();
    await other.getByRole("button", { name: "Kaydet" }).click();
    await expect(confirm).not.toBeChecked();
    await expect(other.getByLabel("Model")).toHaveValue("Konflikt B");

    // Confirmed against the version now current, the warning resolves without a reload.
    await confirm.check();
    await other.getByRole("button", { name: "Kaydet" }).click();
    await expect(other.getByText("Kaydedildi (sürüm 4).")).toBeVisible();
    await expect(other.getByLabel("Model")).toHaveValue("Konflikt B");
    await expect(confirm).toHaveCount(0);
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

  test("product images can be reordered and a cover chosen", async ({ page }) => {
    const slug = `rolex-order-${unique()}`;
    await signIn(page, accounts().editor);
    await createProduct(page, slug, `Reihenfolge ${unique()}`, "8000");
    // Each change bumps the product version; waiting for the exact number avoids
    // matching the previous confirmation that is still on screen.
    for (const [index, color] of ["#111111", "#eeeeee"].entries()) {
      await page
        .getByLabel("Görsel", { exact: true })
        .setInputFiles(await pngFile(color));
      await page.getByRole("button", { name: "Yükle" }).click();
      await expect(page.getByText(`Kaydedildi (sürüm ${index + 2}).`)).toBeVisible();
    }
    const images = page.locator(
      "#product-images ~ ul li img, section[aria-labelledby=product-images] li img",
    );
    const before = await images.evaluateAll((els) =>
      els.map((e) => e.getAttribute("src")),
    );
    await page.getByRole("button", { name: "Kapak yap" }).first().click();
    await expect(page.getByText("Kaydedildi (sürüm 4).")).toBeVisible();
    const after = await images.evaluateAll((els) =>
      els.map((e) => e.getAttribute("src")),
    );
    expect(after).toEqual([before[1], before[0]]);

    await page.goto(`/de/collection/${slug}`);
    const cover = await page.locator("article img").first().getAttribute("src");
    const want =
      decodeURIComponent(after[0] ?? "")
        .split("url=")[1]
        ?.split("&")[0] ?? "";
    if (!decodeURIComponent(cover ?? "").includes(want)) {
      // Evidence for an intermittent stale cover (ACTIONS-TAKEN #138): does the
      // public page heal on later requests, and what does the page cache report?
      const seen: string[] = [];
      for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(500);
        const r = await page.request.get(`/de/collection/${slug}`);
        const html = await r.text();
        const m = html.match(/_v(\d)_[0-9a-f]{8}\.webp/);
        seen.push(`${r.headers()["x-nextjs-cache"] ?? "-"}:${m?.[0]}`);
      }
      console.log("Stale cover; later requests:", seen.join(" | "), "wanted", want);
    }
    expect(decodeURIComponent(cover ?? "")).toContain(
      decodeURIComponent(after[0] ?? "")
        .split("url=")[1]
        ?.split("&")[0] ?? "",
    );
  });

  test("an image upload keeps unsaved edits, which then save without a conflict", async ({
    page,
  }) => {
    const slug = `rolex-keep-${unique()}`;
    await signIn(page, accounts().editor);
    await createProduct(page, slug, `Keep ${unique()}`, "8000");
    const price = page.getByRole("textbox", { name: "Fiyat (EUR, boş = fiyat sorunuz)" });
    await price.fill("9100"); // typed, not saved yet
    await page
      .getByLabel("Görsel", { exact: true })
      .setInputFiles(await pngFile("#445566"));
    await page.getByRole("button", { name: "Yükle" }).click();
    await expect(page.getByText("Kaydedildi (sürüm 2).")).toBeVisible();
    await expect(page.locator("#product-images ~ ul img")).toHaveCount(1);
    // The edit form was not reset by the upload …
    await expect(price).toHaveValue("9100");
    // … and saving it is not refused although the version moved on.
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page).toHaveURL(/\?saved=3$/);
    await expect(price).toHaveValue("9100");
    await expect(page.locator("#product-images ~ ul img")).toHaveCount(1);
  });

  test("an image move from an outdated page is refused with a message", async ({
    page,
  }) => {
    const slug = `rolex-stale-${unique()}`;
    await signIn(page, accounts().editor);
    const id = await createProduct(page, slug, `Stale ${unique()}`, "8000");
    for (const [index, color] of ["#111111", "#eeeeee"].entries()) {
      await page
        .getByLabel("Görsel", { exact: true })
        .setInputFiles(await pngFile(color));
      await page.getByRole("button", { name: "Yükle" }).click();
      await expect(page.getByText(`Kaydedildi (sürüm ${index + 2}).`)).toBeVisible();
    }
    await expect(page.locator("#product-images ~ ul img")).toHaveCount(2);
    // A second tab removes the cover in the meantime.
    const other = await page.context().newPage();
    await other.goto(`/admin/products/${id}`);
    await other.getByRole("button", { name: "Kaldır", exact: true }).first().click();
    // The removed image (and its controls) disappear: that is the confirmation.
    await expect(other.locator("#product-images ~ ul img")).toHaveCount(1);
    await other.close();

    // This tab still shows both images, has an unsaved price edit,
    // and tries to choose the second image as cover.
    const price = page.getByRole("textbox", { name: "Fiyat (EUR, boş = fiyat sorunuz)" });
    await price.fill("8800");
    await page.getByRole("button", { name: "Kapak yap" }).click();
    await expect(
      page.getByText(
        "Görseller bu arada başka biri tarafından değiştirildi; sayfa güncellendi.",
        {
          exact: false,
        },
      ),
    ).toBeVisible();
    // The page updated itself in place: the current list, and the edit is still there.
    await expect(page.locator("#product-images ~ ul img")).toHaveCount(1);
    await expect(price).toHaveValue("8800");
  });

  test("a restore never republishes a sold item and is refused from an outdated page", async ({
    page,
  }) => {
    const slug = `rolex-restore-${unique()}`;
    await signIn(page, accounts().editor);
    const id = await createProduct(page, slug, `Restore ${unique()}`, "8000"); // v1
    await page.getByRole("combobox", { name: "Durum" }).selectOption("sold");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page).toHaveURL(/\?saved=2$/);

    await page.goto(`/admin/history/product/${id}`);
    await expect(
      page.getByText("sitede görünürlük ve satış durumu değişmez", { exact: false }),
    ).toBeVisible();
    // Someone saves again after this history page was opened.
    const other = await page.context().newPage();
    await other.goto(`/admin/products/${id}`);
    await other
      .getByRole("textbox", { name: "Fiyat (EUR, boş = fiyat sorunuz)" })
      .fill("7000");
    await other.getByRole("button", { name: "Kaydet" }).click();
    await expect(other).toHaveURL(/\?saved=3$/);
    await other.close();

    await page.getByRole("button", { name: "Bu sürüme dön" }).last().click();
    await expect(page.getByText(/bu istek uygulanmadı/)).toBeVisible();

    // From a fresh page the restore works, and the product stays sold.
    await page.goto(`/admin/history/product/${id}`);
    await page.getByRole("button", { name: "Bu sürüme dön" }).last().click();
    await expect(page.getByText("v1 geri yüklendi", { exact: false })).toBeVisible();
    const restoredUrl = page.url();
    await page.goto(`/admin/products/${id}`);
    await expect(page.getByRole("combobox", { name: "Durum" })).toHaveValue("sold");
    await expect(
      page.getByRole("textbox", { name: "Fiyat (EUR, boş = fiyat sorunuz)" }),
    ).toHaveValue("8000");

    // After a later change, the old "restored" link no longer claims it is current.
    await page
      .getByRole("textbox", { name: "Fiyat (EUR, boş = fiyat sorunuz)" })
      .fill("8100");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page).toHaveURL(/\?saved=\d+$/);
    await page.goto(restoredUrl);
    await expect(page.getByText("v1 geri yüklendi", { exact: false })).toHaveCount(0);
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
