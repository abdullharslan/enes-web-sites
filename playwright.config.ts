import { defineConfig, devices } from "@playwright/test";

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
    // Strict per-pixel threshold: low-contrast text on the dark theme slips through the 0.2 default.
    toHaveScreenshot: {
      threshold: 0.05,
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
    },
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/de`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
