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

// Mock FileReader for file drag-drop tests
// happy-dom's FileReader doesn't properly trigger onload events
class MockFileReader {
  result: string | ArrayBuffer | null = null
  error: Error | null = null
  readyState: number = 0
  onload: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onprogress: ((event: any) => void) | null = null
  onloadstart: ((event: any) => void) | null = null
  onloadend: ((event: any) => void) | null = null

  readAsText(blob: Blob): void {
    this.readyState = 1 // LOADING

    // Use the blob.text() API which returns a promise
    // We need to schedule the callback in the next tick like the real FileReader
    if (blob && typeof (blob as any).text === 'function') {
      ;(blob as any).text().then((text: string) => {
        this.result = text
        this.readyState = 2 // DONE

        if (this.onload) {
          const event = {
            target: this,
            loaded: text.length,
            total: text.length,
          }
          this.onload(event)
        }
      }).catch((err: Error) => {
        this.error = err
        this.readyState = 2 // DONE

        if (this.onerror) {
          const event = {
            target: this,
          }
          this.onerror(event)
        }
      })
    } else {
      // Fallback for non-standard blob implementations
      queueMicrotask(() => {
        this.error = new Error('Blob.text() not available')
        this.readyState = 2

        if (this.onerror) {
          const event = {
            target: this,
          }
          this.onerror(event)
        }
      })
    }
  }

  readAsArrayBuffer(): void {
    this.readyState = 1
    queueMicrotask(() => {
      this.readyState = 2
    })
  }

  readAsDataURL(): void {
    this.readyState = 1
    queueMicrotask(() => {
      this.readyState = 2
    })
  }

  abort(): void {
    this.readyState = 2
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean { return true }
}

// Replace global FileReader with our mock
;(global as any).FileReader = MockFileReader

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
