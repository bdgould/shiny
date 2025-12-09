import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionStore } from '../connection'

// Mock window.electronAPI
const mockBackends = [
  {
    id: 'backend-1',
    name: 'Test Backend 1',
    provider: 'sparql11' as const,
    endpoint: 'http://localhost:3030/dataset/query',
  },
  {
    id: 'backend-2',
    name: 'Test Backend 2',
    provider: 'graphstudio' as const,
    endpoint: 'http://localhost:7200',
  },
]

describe('useConnectionStore', () => {
  beforeEach(() => {
    // Create a fresh Pinia instance before each test
    setActivePinia(createPinia())

    // Reset mocks
    vi.clearAllMocks()

    // Setup window and electronAPI for tests
    ;(global as any).window = global
    ;(global as any).electronAPI = {
      query: { execute: vi.fn() },
      backends: {
        getAll: vi.fn().mockResolvedValue([]),
        getSelected: vi.fn().mockResolvedValue(null),
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
  })

  describe('initial state', () => {
    it('should have empty backends array', () => {
      const store = useConnectionStore()

      expect(store.backends).toEqual([])
      expect(store.hasBackends).toBe(false)
    })

    it('should have no selected backend', () => {
      const store = useConnectionStore()

      expect(store.selectedBackendId).toBeNull()
      expect(store.selectedBackend).toBeNull()
    })

    it('should not be loading', () => {
      const store = useConnectionStore()

      expect(store.isLoading).toBe(false)
    })

    it('should have no error', () => {
      const store = useConnectionStore()

      expect(store.error).toBeNull()
    })
  })

  describe('loadBackends', () => {
    it('should load backends from electron API', async () => {
      ;(global as any).electronAPI.backends.getAll = vi.fn().mockResolvedValue(mockBackends)
      ;(global as any).electronAPI.backends.getSelected = vi.fn().mockResolvedValue('backend-1')

      const store = useConnectionStore()
      await store.loadBackends()

      expect(store.backends).toEqual(mockBackends)
      expect(store.selectedBackendId).toBe('backend-1')
      expect(store.hasBackends).toBe(true)
    })

    it('should set loading state during load', async () => {
      let resolvePromise: any
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      ;(global as any).electronAPI.backends.getAll = vi.fn().mockReturnValue(promise)
      ;(global as any).electronAPI.backends.getSelected = vi.fn().mockResolvedValue(null)

      const store = useConnectionStore()
      const loadPromise = store.loadBackends()

      expect(store.isLoading).toBe(true)

      resolvePromise(mockBackends)
      await loadPromise

      expect(store.isLoading).toBe(false)
    })

    it('should handle errors when loading backends', async () => {
      const errorMessage = 'Failed to load backends'
      ;(global as any).electronAPI.backends.getAll = vi
        .fn()
        .mockRejectedValue(new Error(errorMessage))
      ;(global as any).electronAPI.backends.getSelected = vi.fn().mockResolvedValue(null)

      const store = useConnectionStore()

      await expect(store.loadBackends()).rejects.toThrow(errorMessage)
      expect(store.error).toBe(errorMessage)
      expect(store.isLoading).toBe(false)
    })
  })

  describe('selectedBackend computed', () => {
    it('should return the selected backend object', async () => {
      ;(global as any).electronAPI.backends.getAll = vi.fn().mockResolvedValue(mockBackends)
      ;(global as any).electronAPI.backends.getSelected = vi.fn().mockResolvedValue('backend-2')

      const store = useConnectionStore()
      await store.loadBackends()

      expect(store.selectedBackend).toEqual(mockBackends[1])
      expect(store.selectedBackend?.name).toBe('Test Backend 2')
    })

    it('should return null if no backend is selected', () => {
      const store = useConnectionStore()
      store.backends = mockBackends
      store.selectedBackendId = null

      expect(store.selectedBackend).toBeNull()
    })

    it('should return null if selected ID does not match any backend', () => {
      const store = useConnectionStore()
      store.backends = mockBackends
      store.selectedBackendId = 'nonexistent-id'

      expect(store.selectedBackend).toBeNull()
    })
  })

  describe('hasBackends computed', () => {
    it('should return true when backends exist', () => {
      const store = useConnectionStore()
      store.backends = mockBackends

      expect(store.hasBackends).toBe(true)
    })

    it('should return false when no backends exist', () => {
      const store = useConnectionStore()

      expect(store.hasBackends).toBe(false)
    })
  })

  describe('selectBackend', () => {
    it('should update selectedBackendId', async () => {
      ;(global as any).electronAPI.backends.setSelected = vi.fn().mockResolvedValue(undefined)

      const store = useConnectionStore()
      store.backends = mockBackends

      await store.selectBackend('backend-2')

      expect(store.selectedBackendId).toBe('backend-2')
      expect(store.selectedBackend).toEqual(mockBackends[1])
    })

    it('should accept null to deselect', async () => {
      ;(global as any).electronAPI.backends.setSelected = vi.fn().mockResolvedValue(undefined)

      const store = useConnectionStore()
      store.backends = mockBackends
      store.selectedBackendId = 'backend-1'

      await store.selectBackend(null)

      expect(store.selectedBackendId).toBeNull()
      expect(store.selectedBackend).toBeNull()
    })
  })
})
