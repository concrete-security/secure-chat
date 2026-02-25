import { defineConfig, devices } from "@playwright/test"

const playwrightHost = process.env.PLAYWRIGHT_WEB_HOST?.trim() || "127.0.0.1"
const playwrightPort = Number(process.env.PLAYWRIGHT_WEB_PORT || "3000")
const playwrightBaseUrl = `http://${playwrightHost}:${playwrightPort}`

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: playwrightBaseUrl,
    trace: "on-first-retry",
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm dev --hostname ${playwrightHost} --port ${playwrightPort}`,
    url: playwrightBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_PROVIDER_BASE_URL: "http://127.0.0.1:4000",
      NEXT_PUBLIC_PROVIDER_MODEL: "test-model",
      FORM_TOKEN_SECRET: process.env.FORM_TOKEN_SECRET ?? "test-form-token",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://dummy.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "dummy-anon-key",
      // Test mode for secure-chat.spec.ts: aTLS uses WebSocket which can't be mocked by Playwright.
      // Setting empty proxy URL + test mode enables auto-verification for UI flow tests.
      NEXT_PUBLIC_ATTESTATION_TEST_MODE: "true",
      NEXT_PUBLIC_ATLAS_PROXY_URL: "",
    },
  },
})
