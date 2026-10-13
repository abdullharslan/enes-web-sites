import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Local credentials live in .env.local (never committed); CI provides real env vars.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    // One database: run files sequentially so schema resets never race.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
