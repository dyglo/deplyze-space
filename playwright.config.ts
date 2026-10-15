import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://localhost:3000",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node tests/local-server.mts",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:8787",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
