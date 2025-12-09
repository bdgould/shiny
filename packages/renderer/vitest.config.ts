import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'
import path from 'path'

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      name: 'renderer',
      environment: 'happy-dom',
      include: ['src/**/*.{test,spec}.{ts,vue.ts}', 'src/**/__tests__/**/*.{ts,vue.ts}'],
      globals: true,
      setupFiles: [path.resolve(__dirname, './tests/setup.ts')],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'dist/**',
          '**/*.d.ts',
          '**/__tests__/**',
          '**/node_modules/**',
          'src/main.ts', // Entry point
          '**/*.config.ts',
          'tests/**',
        ],
        thresholds: {
          lines: 50,
          functions: 50,
          branches: 50,
          statements: 50,
        },
      },
    },
  })
)
