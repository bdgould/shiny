import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    name: 'main',
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**/*.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'dist/**',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/node_modules/**',
        'src/index.ts', // Entry point
      ],
      // Ratchet floors: measured across all source files, not just files tests import.
      // Raise these as coverage improves; never lower them.
      thresholds: {
        lines: 11,
        functions: 18,
        branches: 6,
        statements: 11,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
