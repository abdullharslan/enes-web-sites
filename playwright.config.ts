import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local credentials live in .env.local (never committed).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// E2E runs a production server on its own port so the dev server on 1111 stays usable.
const PORT = Number(process.env.E2E_PORT ?? 1112);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: {
    // Strict per-pixel threshold (low-contrast text on the dark theme slips through the 0.2
    // default) and an absolute pixel budget: a ratio of even 0.1 % let a new "FR" link through.
    toHaveScreenshot: {
      threshold: 0.05,
      maxDiffPixels: 50,
      animations: "disabled",
    },
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    // Read-only checks of the public site (golden master, visuals) run first…
    {
      name: "site",
      testIgnore: /admin-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // …then admin tests, which mutate data, so they can never disturb the baselines.
    {
      name: "admin",
      testMatch: /admin-.*\.spec\.ts/,
      dependencies: ["site"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Fresh isolated database (+ test accounts), then a production build against it.
    command: `npx tsx e2e/prepare.ts && npx next build && npx next start -p ${PORT}`,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_E2E ?? "",
      DATABASE_URL_E2E: process.env.DATABASE_URL_E2E ?? "",
      DATABASE_URL_ADMIN: process.env.DATABASE_URL ?? "",
      MEDIA_ROOT: "storage/e2e-media",
    },
    url: `${baseURL}/de`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
