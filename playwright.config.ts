import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  globalSetup: "./tests/smoke/global-setup.ts",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5180",
    trace: "on-first-retry"
  }
});
