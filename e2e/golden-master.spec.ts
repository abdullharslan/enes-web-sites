import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Characterization tests: the visible text of key pages was captured before the
 * data layer moved from static files to PostgreSQL. Any unintended change in
 * what visitors read fails here. Regenerate deliberately with UPDATE_GOLDEN=1.
 */
const PAGES = [
  "/de",
  "/en/collection?availability=all",
  "/tr/collection?brand=hermes",
  "/de/collection/rolex-submariner-date-126610ln",
  "/en/collection/hermes-constance-24-croco",
  "/tr/collection/van-cleef-arpels-perlee-ring",
] as const;

const fileFor = (path: string) =>
  join(
    __dirname,
    "golden",
    `${path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")}.txt`,
  );

for (const path of PAGES) {
  test(`golden master: ${path}`, async ({ page }) => {
    await page.goto(path);
    // Streamed <Suspense> content must have replaced its skeleton before capturing.
    await expect(page.locator("main .animate-pulse")).toHaveCount(0);
    const text = (await page.locator("main").innerText())
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    const file = fileFor(path);
    if (process.env.UPDATE_GOLDEN === "1" || !existsSync(file)) {
      writeFileSync(file, `${text}\n`);
      test.info().annotations.push({ type: "golden", description: `wrote ${file}` });
      return;
    }
    expect(text).toBe(readFileSync(file, "utf8").trimEnd());
  });
}
