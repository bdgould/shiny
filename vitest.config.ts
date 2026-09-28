import { defineConfig } from 'vitest/config'

// Root config so `vitest` / `vitest --ui` from the repo root runs every package
// with its own environment, setup files, and aliases.
export default defineConfig({
  test: {
    projects: ['packages/main', 'packages/preload', 'packages/renderer'],
  },
})
