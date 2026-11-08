import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PAGES, VIEWPORTS } from "./pages";

const MIN_TARGET = 44;

test.describe("accessibility (axe, WCAG 2.2 AA)", () => {
  for (const path of PAGES) {
    test(`no violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
    });
  }
});

test.describe("responsive layout", () => {
  for (const viewport of VIEWPORTS) {
    for (const path of PAGES) {
      test(`${viewport.name}: no horizontal overflow and ${MIN_TARGET}px targets on ${path}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);

        // Fixed elements never widen the document, so also check every control is inside the viewport.
        const offscreen = await page.evaluate(() =>
          [
            ...document.querySelectorAll<HTMLElement>(
              "a[href], button, select, input, textarea",
            ),
          ]
            .filter(
              (el) =>
                el.checkVisibility() &&
                !el.closest("dialog:not([open])") &&
                !el.closest("[data-scroll-x]") &&
                !el.matches(".sr-only"),
            )
            .map((el) => ({ el, box: el.getBoundingClientRect() }))
            .filter(
              ({ box }) =>
                box.width > 0 && (box.left < 0 || box.right > window.innerWidth + 0.5),
            )
            .map(
              ({ el, box }) =>
                `${el.tagName} "${el.textContent?.trim().slice(0, 20)}" ${Math.round(box.left)}–${Math.round(box.right)}`,
            ),
        );
        expect(offscreen).toEqual([]);

        const smallTargets = await page.evaluate((min) => {
          const selector =
            "a[href], button, select, input:not([type=checkbox]), textarea";
          return (
            [...document.querySelectorAll<HTMLElement>(selector)]
              // Visually-hidden skip links are checked in their focused state below.
              .filter(
                (el) =>
                  el.checkVisibility() &&
                  !el.closest("dialog:not([open])") &&
                  !el.matches(".sr-only"),
              )
              .map((el) => ({ el, box: el.getBoundingClientRect() }))
              .filter(({ box }) => box.width > 0 && (box.height < min || box.width < min))
              .map(
                ({ el, box }) =>
                  `${el.tagName} "${el.textContent?.trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
              )
          );
        }, MIN_TARGET);
        expect(smallTargets).toEqual([]);
      });
    }
  }
});

test("skip link becomes a visible 44px target on focus", async ({ page }) => {
  await page.goto("/de");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Zum Inhalt springen" });
  await expect(skip).toBeFocused();
  const box = await skip.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(MIN_TARGET);
  await skip.press("Enter");
  await expect(page).toHaveURL(/#content$/);
});

test.describe("phone without JavaScript", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });

  test("plain links change the language, keeping the page", async ({ page }) => {
    await page.goto("/de/sell");
    const links = page.getByRole("navigation", { name: "Sprache" }).getByRole("link");
    await expect(links).toHaveCount(4);
    for (const link of await links.all()) {
      await link.scrollIntoViewIfNeeded();
      const box = await link.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(box?.height).toBeGreaterThanOrEqual(MIN_TARGET);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await links.getByText("en", { exact: true }).click();
    await expect(page).toHaveURL(/\/en\/sell$/);
  });
});

test.describe("visual regression", () => {
  // Baselines are macOS renders; Linux fonts and anti-aliasing differ by far more
  // than the threshold, so pixel comparison only runs where the baselines were made.
  test.skip(process.platform !== "darwin", "visual baselines are macOS (darwin) renders");
  const SNAPSHOT_PAGES = [
    "/de",
    "/de/collection",
    "/de/collection/rolex-submariner-date-126610ln",
    "/de/sell",
  ] as const;
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    for (const path of SNAPSHOT_PAGES) {
      test(`${viewport.name} ${path}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
        // Streamed <Suspense> content must replace its skeleton before the capture.
        await expect(page.locator("main .animate-pulse")).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot({ fullPage: false });
      });
    }
  }
});
