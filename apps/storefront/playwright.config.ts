import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8000",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    // Login requests contain credentials; do not retain authentication traces.
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
})
