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
      include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}', 'src/**/*.test.vue.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{git,cache,output,temp}/**',
        'src/**/__tests__/fixtures/**',
        'src/**/__tests__/helpers/**',
      ],
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
          // your specific problem dirs/files
          'src/**/__tests__/fixtures/**',
          'src/**/__tests__/helpers/**',
          'src/**/__tests__/**/fixtures/**',
          'src/**/__tests__/**/helpers/**',
          'src/components/**/icons/**',
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
