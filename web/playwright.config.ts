// End-to-end tests (e2e/*.spec.ts): the web app against the real backend and a fake mailserver, see "End-to-end
// tests" in README.md. Every test signs up its own users, so the database only needs to be migrated.

import { defineConfig, devices } from "@playwright/test";

import { BACKEND_URL, MAIL_URL, WEB_URL, backendEnv, python } from "./e2e/env";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // A phone, the web app is for Android users
  use: { baseURL: WEB_URL, trace: "retain-on-failure", ...devices["Pixel 7"] },
  webServer: [
    {
      command: "node e2e/fake-mailserver.mjs",
      url: `${MAIL_URL}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `"${python}" -m uvicorn app.main:app --port 5100`,
      cwd: "../backend",
      env: backendEnv,
      url: `${BACKEND_URL}/v1/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // CI tests the production build (npm run build runs before) like infra/web.Dockerfile serves it, with the static
      // assets next to the standalone server. Locally the dev server is enough.
      command: process.env.CI
        ? "cp -R .next/static .next/standalone/.next/ && cp -R public .next/standalone/ && node .next/standalone/server.js"
        : "npx next dev --port 3100",
      env: { BACKEND_URL, PORT: "3100", HOSTNAME: "localhost" },
      url: WEB_URL,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
