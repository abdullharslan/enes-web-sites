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

test.describe("visual regression", () => {
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
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot({ fullPage: false });
      });
    }
  }
});
