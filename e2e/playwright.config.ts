import { defineConfig } from '@playwright/test'

// End-to-end smoke tests drive the real Electron app. The renderer is served by
// the Vite dev server because an unpackaged app loads http://localhost:5173.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: '../test-results/e2e',
  // Packaged runs load the renderer from disk and need no dev server.
  webServer: process.env.SHINY_E2E_EXECUTABLE
    ? undefined
    : {
        command: 'npm run dev -w @shiny/renderer',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
