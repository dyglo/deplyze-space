import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/hosted",
  workers: 1,
  timeout: 240000,
  retries: 0,
  use: {
    baseURL: process.env.HOSTED_BASE_URL || "https://deplyze.space",
    // Never retain traces: request URLs contain short-lived bearer signatures.
    trace: "off",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    { name: "desktop-staging", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-staging", use: { ...devices["Pixel 7"] } },
  ],
});
