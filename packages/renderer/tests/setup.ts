/**
 * Global test setup for renderer tests
 * This file runs before all tests in the renderer package
 */

import { config } from '@vue/test-utils'
import { vi } from 'vitest'

// Configure Vue Test Utils global settings
config.global.stubs = {
  // Stub teleport for modal/dialog components
  Teleport: true,
}

// Mock window.electronAPI for renderer tests
;(global as any).window = global
;(global as any).electronAPI = {
  query: {
    execute: vi.fn(),
  },
  backends: {
    getAll: vi.fn(),
    getSelected: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    validate: vi.fn(),
  },
  graphstudio: {
    listGraphs: vi.fn(),
    getCurrentGraph: vi.fn(),
    setCurrentGraph: vi.fn(),
  },
  files: {
    saveQuery: vi.fn(),
    openQuery: vi.fn(),
    saveResults: vi.fn(),
  },
  onMenuCommand: vi.fn(),
}
