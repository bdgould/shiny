import { defineWorkspace } from 'vitest/config'
import path from 'path'

export default defineWorkspace([
  {
    extends: 'packages/main/vitest.config.ts',
    test: {
      name: 'main',
      root: './packages/main',
    },
  },
  {
    extends: 'packages/preload/vitest.config.ts',
    test: {
      name: 'preload',
      root: './packages/preload',
    },
  },
  {
    extends: 'packages/renderer/vitest.config.ts',
    test: {
      name: 'renderer',
      root: './packages/renderer',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './packages/renderer/src'),
      },
    },
  },
])
