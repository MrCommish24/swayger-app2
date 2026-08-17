import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: "list",
  use: {
    // The Expo web dev server runs on port 8081; backend on 5000.
    // Tests navigate to the web app directly.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8081",
    headless: true,
    viewport: { width: 390, height: 844 },
    // Store browser state between tests in the same file
    storageState: undefined,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use the Nix-provided Chromium binary — the npm-downloaded one lacks
        // glibc shared libraries (libglib-2.0.so.0) in the NixOS container.
        launchOptions: {
          executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
            "/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
  ],
  // Do NOT start a webServer here — the dev server is already managed by the
  // Replit workflow. The tests assume the server is already running.
});
