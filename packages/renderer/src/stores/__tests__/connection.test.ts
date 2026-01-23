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

  describe('createBackend', () => {
    const newBackendConfig = {
      name: 'New Backend',
      type: 'sparql11',
      endpoint: 'http://localhost:8080/sparql',
      authType: 'none',
    }

    const createdBackend = {
      id: 'backend-new',
      name: 'New Backend',
      provider: 'sparql11' as const,
      endpoint: 'http://localhost:8080/sparql',
    }

    it('should create a backend and add it to the list', async () => {
      ;(global as any).electronAPI.backends.create = vi.fn().mockResolvedValue(createdBackend)
      ;(global as any).electronAPI.backends.setSelected = vi.fn().mockResolvedValue(undefined)

      const store = useConnectionStore()
      const result = await store.createBackend(newBackendConfig)

      expect(result).toEqual(createdBackend)
      expect(store.backends).toHaveLength(1)
      expect(store.backends[0]).toEqual(createdBackend)
    })

    it('should auto-select first created backend', async () => {
      ;(global as any).electronAPI.backends.create = vi.fn().mockResolvedValue(createdBackend)
      ;(global as any).electronAPI.backends.setSelected = vi.fn().mockResolvedValue(undefined)

      const store = useConnectionStore()
      await store.createBackend(newBackendConfig)

      expect(store.selectedBackendId).toBe('backend-new')
      expect((global as any).electronAPI.backends.setSelected).toHaveBeenCalledWith('backend-new')
    })

    it('should not auto-select if there are already backends', async () => {
      ;(global as any).electronAPI.backends.create = vi.fn().mockResolvedValue(createdBackend)

      const store = useConnectionStore()
      store.backends = [...mockBackends]
      store.selectedBackendId = 'backend-1'

      await store.createBackend(newBackendConfig)

      expect(store.selectedBackendId).toBe('backend-1')
    })

    it('should set loading state during creation', async () => {
      let resolvePromise: any
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      ;(global as any).electronAPI.backends.create = vi.fn().mockReturnValue(promise)
      ;(global as any).electronAPI.backends.setSelected = vi.fn().mockResolvedValue(undefined)

      const store = useConnectionStore()
      const createPromise = store.createBackend(newBackendConfig)

      expect(store.isLoading).toBe(true)

      resolvePromise(createdBackend)
      await createPromise

      expect(store.isLoading).toBe(false)
    })

    it('should handle error when creating backend', async () => {
      const errorMessage = 'Failed to create backend'
      ;(global as any).electronAPI.backends.create = vi
        .fn()
        .mockRejectedValue(new Error(errorMessage))

      const store = useConnectionStore()

      await expect(store.createBackend(newBackendConfig)).rejects.toThrow(errorMessage)
      expect(store.error).toBe(errorMessage)
      expect(store.isLoading).toBe(false)
    })

    it('should pass credentials when provided', async () => {
      ;(global as any).electronAPI.backends.create = vi.fn().mockResolvedValue(createdBackend)
      ;(global as any).electronAPI.backends.setSelected = vi.fn().mockResolvedValue(undefined)

      const store = useConnectionStore()
      const credentials = { username: 'user', password: 'pass' }

      await store.createBackend(newBackendConfig, credentials)

      expect((global as any).electronAPI.backends.create).toHaveBeenCalledWith(
        newBackendConfig,
        credentials
      )
    })
  })

  describe('updateBackend', () => {
    const updatedBackend = {
      ...mockBackends[0],
      name: 'Updated Backend Name',
    }

    it('should update backend and refresh local state', async () => {
      ;(global as any).electronAPI.backends.update = vi.fn().mockResolvedValue(updatedBackend)

      const store = useConnectionStore()
      store.backends = [...mockBackends]

      const result = await store.updateBackend('backend-1', { name: 'Updated Backend Name' })

      expect(result).toEqual(updatedBackend)
      expect(store.backends[0].name).toBe('Updated Backend Name')
    })

    it('should set loading state during update', async () => {
      let resolvePromise: any
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      ;(global as any).electronAPI.backends.update = vi.fn().mockReturnValue(promise)

      const store = useConnectionStore()
      store.backends = [...mockBackends]

      const updatePromise = store.updateBackend('backend-1', { name: 'New Name' })

      expect(store.isLoading).toBe(true)

      resolvePromise(updatedBackend)
      await updatePromise

      expect(store.isLoading).toBe(false)
    })

    it('should handle error when updating backend', async () => {
      const errorMessage = 'Failed to update backend'
      ;(global as any).electronAPI.backends.update = vi
        .fn()
        .mockRejectedValue(new Error(errorMessage))

      const store = useConnectionStore()
      store.backends = [...mockBackends]

      await expect(store.updateBackend('backend-1', { name: 'New Name' })).rejects.toThrow(
        errorMessage
      )
      expect(store.error).toBe(errorMessage)
      expect(store.isLoading).toBe(false)
    })

    it('should pass credentials when provided', async () => {
      ;(global as any).electronAPI.backends.update = vi.fn().mockResolvedValue(updatedBackend)

      const store = useConnectionStore()
      store.backends = [...mockBackends]

      const credentials = { username: 'newuser', password: 'newpass' }
      await store.updateBackend('backend-1', { name: 'New Name' }, credentials)

      expect((global as any).electronAPI.backends.update).toHaveBeenCalledWith(
        'backend-1',
        { name: 'New Name' },
        credentials
      )
    })
  })

  describe('deleteBackend', () => {
    it('should delete backend and remove from list', async () => {
      ;(global as any).electronAPI.backends.delete = vi.fn().mockResolvedValue(undefined)

      const store = useConnectionStore()
      store.backends = [...mockBackends]

      const result = await store.deleteBackend('backend-1')

      expect(result).toBe(true)
      expect(store.backends).toHaveLength(1)
      expect(store.backends.find((b) => b.id === 'backend-1')).toBeUndefined()
    })

    it('should clear selection if deleted backend was selected', async () => {
      ;(global as any).electronAPI.backends.delete = vi.fn().mockResolvedValue(undefined)

      const store = useConnectionStore()
      store.backends = [...mockBackends]
      store.selectedBackendId = 'backend-1'

      await store.deleteBackend('backend-1')

      expect(store.selectedBackendId).toBeNull()
    })

    it('should not affect selection if different backend is deleted', async () => {
      ;(global as any).electronAPI.backends.delete = vi.fn().mockResolvedValue(undefined)

      const store = useConnectionStore()
      store.backends = [...mockBackends]
      store.selectedBackendId = 'backend-1'

      await store.deleteBackend('backend-2')

      expect(store.selectedBackendId).toBe('backend-1')
    })

    it('should set loading state during deletion', async () => {
      let resolvePromise: any
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      ;(global as any).electronAPI.backends.delete = vi.fn().mockReturnValue(promise)

      const store = useConnectionStore()
      store.backends = [...mockBackends]

      const deletePromise = store.deleteBackend('backend-1')

      expect(store.isLoading).toBe(true)

      resolvePromise(undefined)
      await deletePromise

      expect(store.isLoading).toBe(false)
    })

    it('should handle error when deleting backend', async () => {
      const errorMessage = 'Failed to delete backend'
      ;(global as any).electronAPI.backends.delete = vi
        .fn()
        .mockRejectedValue(new Error(errorMessage))

      const store = useConnectionStore()
      store.backends = [...mockBackends]

      await expect(store.deleteBackend('backend-1')).rejects.toThrow(errorMessage)
      expect(store.error).toBe(errorMessage)
      expect(store.isLoading).toBe(false)
      // Backend should still be in list on error
      expect(store.backends).toHaveLength(2)
    })
  })

  describe('testConnection', () => {
    it('should call testConnection API and return result', async () => {
      const testResult = { success: true, message: 'Connection successful' }
      ;(global as any).electronAPI.backends.testConnection = vi.fn().mockResolvedValue(testResult)

      const store = useConnectionStore()

      const result = await store.testConnection('backend-1')

      expect(result).toEqual(testResult)
      expect((global as any).electronAPI.backends.testConnection).toHaveBeenCalledWith('backend-1')
    })

    it('should handle error when testing connection', async () => {
      const errorMessage = 'Connection test failed'
      ;(global as any).electronAPI.backends.testConnection = vi
        .fn()
        .mockRejectedValue(new Error(errorMessage))

      const store = useConnectionStore()

      await expect(store.testConnection('backend-1')).rejects.toThrow(errorMessage)
    })

    it('should not set isLoading during connection test', async () => {
      let resolvePromise: any
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      ;(global as any).electronAPI.backends.testConnection = vi.fn().mockReturnValue(promise)

      const store = useConnectionStore()
      const testPromise = store.testConnection('backend-1')

      // testConnection should not affect global loading state
      expect(store.isLoading).toBe(false)

      resolvePromise({ success: true })
      await testPromise

      expect(store.isLoading).toBe(false)
    })
  })

  describe('clearError', () => {
    it('should clear error message', () => {
      const store = useConnectionStore()
      store.error = 'Some error message'

      store.clearError()

      expect(store.error).toBeNull()
    })

    it('should do nothing when error is already null', () => {
      const store = useConnectionStore()
      store.error = null

      store.clearError()

      expect(store.error).toBeNull()
    })
  })
})
