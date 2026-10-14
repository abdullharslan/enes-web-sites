import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { accounts, signIn } from "./auth";

test.describe("admin authentication", () => {
  test("anonymous visitors are sent to the login page", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(
      page.getByRole("heading", { name: "Yönetim paneline giriş" }),
    ).toBeVisible();
  });

  test("the admin area is not localised and not indexed", async ({ page }) => {
    const response = await page.goto("/admin/login");
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  });

  test("wrong credentials show one generic message", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-posta").fill(accounts().owner.email);
    await page.getByLabel("Parola").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByText("E-posta veya parola hatalı.")).toBeVisible();

    await page.getByLabel("E-posta").fill("nobody@e2e.example");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByText("E-posta veya parola hatalı.")).toBeVisible();
  });

  test("owner signs in, sees the full menu, and logs out", async ({ page, context }) => {
    await signIn(page, accounts().owner);
    await expect(
      page.getByRole("heading", { name: "Hoş geldiniz, E2E Owner" }),
    ).toBeVisible();
    const menu = page.getByRole("navigation", { name: "Yönetim menüsü" });
    await expect(menu.getByRole("link", { name: "Kullanıcılar" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Denetim kaydı" })).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name.endsWith("mv_session"));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    const device = (await context.cookies()).find((c) => c.name.endsWith("mv_device"));
    expect(device?.httpOnly).toBe(true);
    expect(device?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await menu.getByRole("button", { name: "Çıkış yap" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("editors do not get user management, even by URL", async ({ page }) => {
    await signIn(page, accounts().editor);
    const menu = page.getByRole("navigation", { name: "Yönetim menüsü" });
    await expect(menu.getByRole("link", { name: "Kullanıcılar" })).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page.getByRole("alert").filter({ hasText: "yetkiniz yok" })).toHaveText(
      "Bu işlem için yetkiniz yok.",
    );
    await expect(page.getByText("owner@e2e.example")).toHaveCount(0);
  });

  test("owner can create a user; weak passwords are refused", async ({ page }) => {
    await signIn(page, accounts().owner);
    await page.goto("/admin/users");
    const name = `Yeni Editör ${Date.now().toString(36)}`;
    const form = page.locator("form").filter({ hasText: "Yeni kullanıcı" });
    await form.getByLabel("Ad").fill(name);
    await form.getByLabel("E-posta").fill(`new-${Date.now()}@e2e.example`);
    await form.getByLabel("İlk parola (en az 12 karakter)").fill("short");
    await form.evaluate((f) =>
      f.querySelectorAll("input").forEach((i) => i.removeAttribute("minlength")),
    );
    await form.getByRole("button", { name: "Yeni ekle" }).click();
    await expect(page.getByText("Parola en az 12 karakter olmalı.")).toBeVisible();
    // What was typed survives the failed submission (the password is never echoed back).
    await expect(form.getByLabel("Ad")).toHaveValue(name);
    await expect(form.getByLabel("İlk parola (en az 12 karakter)")).toHaveValue("");

    await form
      .getByLabel("İlk parola (en az 12 karakter)")
      .fill("a long enough passphrase");
    await form.getByRole("button", { name: "Yeni ekle" }).click();
    await expect(page.getByText("Kullanıcı oluşturuldu.")).toBeVisible();
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  });

  test("owner resets a password and changes a role; the user changes their own password", async ({
    page,
    browser,
  }) => {
    const id = Date.now().toString(36);
    const name = `Rollen ${id}`;
    const email = `role-${id}@e2e.example`;
    const first = `first passphrase ${id}`;
    const reset = `reset passphrase ${id}`;
    const own = `own passphrase ${id}`;

    await signIn(page, accounts().owner);
    await page.goto("/admin/users");
    const create = page.locator("form").filter({ hasText: "Yeni kullanıcı" });
    await create.getByLabel("Ad").fill(name);
    await create.getByLabel("E-posta").fill(email);
    await create.getByLabel("İlk parola (en az 12 karakter)").fill(first);
    await create.getByRole("button", { name: "Yeni ekle" }).click();
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    // The user signs in on another device …
    const other = await browser.newContext();
    const userPage = await other.newPage();
    await signIn(userPage, { email, password: first });

    // … then the owner resets the password: that session ends immediately.
    const row = page.getByRole("row").filter({ hasText: email });
    await row.getByLabel(`Yeni parola (en az 12 karakter): ${name}`).fill(reset);
    await row.getByRole("button", { name: "Parolayı sıfırla" }).click();
    await expect(
      row.getByText("Parola değiştirildi; kullanıcının tüm oturumları kapatıldı."),
    ).toBeVisible();
    await userPage.goto("/admin");
    await expect(userPage).toHaveURL(/\/admin\/login$/);

    // Promote to owner; the new role applies to the next request.
    await row.getByLabel(`Rol: ${name}`).selectOption("owner");
    await row.getByRole("button", { name: "Rolü kaydet" }).click();
    await expect(row.getByText("Rol güncellendi.")).toBeVisible();
    await signIn(userPage, { email, password: reset });
    const menu = userPage.getByRole("navigation", { name: "Yönetim menüsü" });
    await expect(menu.getByRole("link", { name: "Kullanıcılar" })).toBeVisible();

    // The user changes their own password; a wrong current password is refused.
    await userPage.goto("/admin/account");
    await userPage.getByLabel("Mevcut parola").fill("not the password");
    await userPage.getByLabel("Yeni parola (en az 12 karakter)").fill(own);
    await userPage.getByLabel("Yeni parola (tekrar)").fill(own);
    await userPage.getByRole("button", { name: "Parolayı değiştir" }).click();
    await expect(userPage.getByText("Mevcut parola yanlış.")).toBeVisible();
    await userPage.getByLabel("Mevcut parola").fill(reset);
    await userPage.getByLabel("Yeni parola (en az 12 karakter)").fill(own);
    await userPage.getByLabel("Yeni parola (tekrar)").fill(own);
    await userPage.getByRole("button", { name: "Parolayı değiştir" }).click();
    await expect(
      userPage.getByText(
        "Parolanız değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.",
      ),
    ).toBeVisible();
    // This session survives the change.
    await userPage.goto("/admin/account");
    await expect(userPage).toHaveURL(/\/admin\/account$/);
    await other.close();

    // The owner's own row offers no role/status controls (cannot lock themselves out).
    await page.reload();
    const ownRow = page.getByRole("row").filter({ hasText: accounts().owner.email });
    await expect(ownRow.getByRole("combobox")).toHaveCount(0);
    await expect(ownRow.getByRole("button")).toHaveCount(0);
  });

  test("admin pages have no accessibility violations", async ({ page }) => {
    await page.goto("/admin/login");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await signIn(page, accounts().owner);
    for (const path of ["/admin", "/admin/users", "/admin/account"]) {
      await page.goto(path);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      expect(result.violations.map((v) => v.id)).toEqual([]);
    }
  });
});
