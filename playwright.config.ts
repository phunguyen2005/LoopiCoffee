import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe") ? { channel: "msedge" } : {}) } }],
  webServer: {
    command: "npm run start", url: "http://127.0.0.1:4173/auth/login",
    reuseExistingServer: true, timeout: 90_000,
  },
});
