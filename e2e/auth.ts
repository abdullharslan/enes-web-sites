import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

interface Account {
  email: string;
  password: string;
}

/** Throw-away accounts created by e2e/prepare.ts for this run only. */
export function accounts(): { owner: Account; editor: Account } {
  return JSON.parse(readFileSync("e2e/.auth/credentials.json", "utf8"));
}

export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("E-posta").fill(account.email);
  await page.getByLabel("Parola").fill(account.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL(/\/admin$/);
}
