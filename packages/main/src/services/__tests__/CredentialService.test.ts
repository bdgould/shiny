import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CredentialService } from '../CredentialService'
import { safeStorage } from 'electron'
import type { BackendConfig, BackendCredentials } from '../../backends/types'

// Mock electron's safeStorage
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(str, 'utf-8')),
    decryptString: vi.fn((buffer: Buffer) => buffer.toString('utf-8')),
  },
}))

// Mock electron-store with proper constructor and state management
const storeData: any = {
  backends: [],
  credentials: {},
  selectedBackendId: null,
  schemaVersion: 1,
}

vi.mock('electron-store', () => {
  return {
    default: vi.fn(function (this: any) {
      this.get = vi.fn((key: string) => {
        // Return a copy to avoid mutation issues
        const value = storeData[key]
        return Array.isArray(value) ? [...value] : value
      })
      this.set = vi.fn((key: string, value: any) => {
        storeData[key] = value
      })

      return this
    }),
  }
})

// Helper to reset store data between tests
function resetStoreData() {
  storeData.backends = []
  storeData.credentials = {}
  storeData.selectedBackendId = null
  storeData.schemaVersion = 1
}

describe('CredentialService', () => {
  let service: CredentialService

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks()

    // Reset store data
    resetStoreData()

    // Create service instance (uses mocked Store from module-level mock)
    service = new CredentialService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('saveCredentials', () => {
    it('should encrypt and save credentials', async () => {
      const backendId = 'test-backend-1'
      const credentials: BackendCredentials = {
        backendId,
        username: 'testuser',
        password: 'testpass123',
      }

      await service.saveCredentials(backendId, credentials)

      // Verify encryption was called
      expect(safeStorage.encryptString).toHaveBeenCalledWith(JSON.stringify(credentials))

      // Verify store was updated
      expect(service['store'].set).toHaveBeenCalledWith(
        'credentials',
        expect.objectContaining({
          [backendId]: expect.any(String),
        })
      )
    })

    it('should warn when encryption is not available', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      await service.saveCredentials('backend-1', {
        backendId: 'backend-1',
        username: 'test',
        password: 'test',
      })

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Encryption not available'))

      consoleSpy.mockRestore()
    })
  })

  describe('getCredentials', () => {
    it('should decrypt and return credentials', async () => {
      const backendId = 'test-backend-1'
      const credentials: BackendCredentials = {
        backendId,
        username: 'testuser',
        password: 'testpass123',
      }

      // Save credentials first
      await service.saveCredentials(backendId, credentials)

      // Retrieve credentials
      const retrieved = await service.getCredentials(backendId)

      expect(retrieved).toEqual(credentials)
      expect(safeStorage.decryptString).toHaveBeenCalled()
    })

    it('should return null for non-existent credentials', async () => {
      const retrieved = await service.getCredentials('nonexistent-backend')

      expect(retrieved).toBeNull()
    })

    it('should return null if decryption fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(safeStorage.decryptString).mockImplementation(() => {
        throw new Error('Decryption failed')
      })

      // Manually add corrupted credentials
      ;(service['store'].get as any).mockReturnValue({ 'backend-1': 'corrupted-data' })

      const retrieved = await service.getCredentials('backend-1')

      expect(retrieved).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('deleteCredentials', () => {
    it('should remove credentials for a backend', async () => {
      const backendId = 'test-backend-1'

      // Add credentials first
      await service.saveCredentials(backendId, {
        backendId,
        username: 'test',
        password: 'test',
      })

      // Delete credentials
      await service.deleteCredentials(backendId)

      // Verify credentials were removed
      expect(service['store'].set).toHaveBeenCalledWith(
        'credentials',
        expect.not.objectContaining({
          [backendId]: expect.anything(),
        })
      )
    })
  })

  describe('saveBackendConfig', () => {
    it('should add a new backend config', async () => {
      const config: BackendConfig = {
        id: 'backend-1',
        name: 'Test Backend',
        type: 'sparql-1.1',
        authType: 'none',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        endpoint: 'http://localhost:3030/dataset/query',
      }

      await service.saveBackendConfig(config)

      expect(service['store'].set).toHaveBeenCalledWith('backends', [config])
    })

    it('should update an existing backend config', async () => {
      const originalConfig: BackendConfig = {
        id: 'backend-1',
        name: 'Original Name',
        type: 'sparql-1.1',
        authType: 'none',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        endpoint: 'http://localhost:3030/dataset/query',
      }

      const updatedConfig: BackendConfig = {
        ...originalConfig,
        name: 'Updated Name',
      }

      // Add original
      await service.saveBackendConfig(originalConfig)

      // Update
      await service.saveBackendConfig(updatedConfig)

      // Verify only one backend exists with updated name
      // Get the last call with 'backends' key
      const backendCalls = (service['store'].set as any).mock.calls.filter(
        (call: any) => call[0] === 'backends'
      )
      const lastCall = backendCalls[backendCalls.length - 1]
      expect(lastCall[1]).toHaveLength(1)
      expect(lastCall[1][0].name).toBe('Updated Name')
    })
  })

  describe('getBackendConfig', () => {
    it('should retrieve backend config by ID', async () => {
      const config: BackendConfig = {
        id: 'backend-1',
        name: 'Test Backend',
        type: 'sparql-1.1',
        authType: 'none',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        endpoint: 'http://localhost:3030/dataset/query',
      }

      await service.saveBackendConfig(config)
      ;(service['store'].get as any).mockReturnValue([config])

      const retrieved = await service.getBackendConfig('backend-1')

      expect(retrieved).toEqual(config)
    })

    it('should return null for non-existent backend', async () => {
      ;(service['store'].get as any).mockReturnValue([])

      const retrieved = await service.getBackendConfig('nonexistent')

      expect(retrieved).toBeNull()
    })
  })

  describe('getAllBackendConfigs', () => {
    it('should return all backend configs', async () => {
      const configs: BackendConfig[] = [
        {
          id: 'backend-1',
          name: 'Backend 1',
          type: 'sparql-1.1',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          endpoint: 'http://localhost:3030/dataset1/query',
        },
        {
          id: 'backend-2',
          name: 'Backend 2',
          type: 'graphstudio',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          endpoint: 'http://localhost:7200',
        },
      ]

      ;(service['store'].get as any).mockReturnValue(configs)

      const retrieved = await service.getAllBackendConfigs()

      expect(retrieved).toEqual(configs)
      expect(retrieved).toHaveLength(2)
    })

    it('should return empty array when no backends exist', async () => {
      ;(service['store'].get as any).mockReturnValue([])

      const retrieved = await service.getAllBackendConfigs()

      expect(retrieved).toEqual([])
    })
  })

  describe('deleteBackendConfig', () => {
    it('should remove backend config and credentials', async () => {
      const config: BackendConfig = {
        id: 'backend-1',
        name: 'Test Backend',
        type: 'sparql-1.1',
        authType: 'none',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        endpoint: 'http://localhost:3030/dataset/query',
      }

      // Add backend and credentials
      await service.saveBackendConfig(config)
      await service.saveCredentials(config.id, {
        backendId: config.id,
        username: 'test',
        password: 'test',
      })

      // Delete backend
      await service.deleteBackendConfig(config.id)

      // Verify backend was removed
      expect(service['store'].set).toHaveBeenCalledWith('backends', [])
    })

    it('should clear selection if deleted backend was selected', async () => {
      service.setSelectedBackendId('backend-1')

      // Mock get to return the right value based on key
      ;(service['store'].get as any).mockImplementation((key: string) => {
        if (key === 'selectedBackendId') return 'backend-1'
        if (key === 'backends') return []
        return storeData[key]
      })

      await service.deleteBackendConfig('backend-1')

      expect(service['store'].set).toHaveBeenCalledWith('selectedBackendId', null)
    })
  })

  describe('selected backend management', () => {
    it('should get selected backend ID', () => {
      ;(service['store'].get as any).mockReturnValue('backend-1')

      const selectedId = service.getSelectedBackendId()

      expect(selectedId).toBe('backend-1')
      expect(service['store'].get).toHaveBeenCalledWith('selectedBackendId')
    })

    it('should set selected backend ID', () => {
      service.setSelectedBackendId('backend-2')

      expect(service['store'].set).toHaveBeenCalledWith('selectedBackendId', 'backend-2')
    })

    it('should allow setting selected backend ID to null', () => {
      service.setSelectedBackendId(null)

      expect(service['store'].set).toHaveBeenCalledWith('selectedBackendId', null)
    })
  })

  describe('schema version management', () => {
    it('should get schema version', () => {
      ;(service['store'].get as any).mockReturnValue(1)

      const version = service.getSchemaVersion()

      expect(version).toBe(1)
      expect(service['store'].get).toHaveBeenCalledWith('schemaVersion')
    })

    it('should set schema version', () => {
      service.setSchemaVersion(2)

      expect(service['store'].set).toHaveBeenCalledWith('schemaVersion', 2)
    })
  })

  describe('isEncryptionAvailable', () => {
    it('should return true when encryption is available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

      const available = service.isEncryptionAvailable()

      expect(available).toBe(true)
    })

    it('should return false when encryption is not available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      const available = service.isEncryptionAvailable()

      expect(available).toBe(false)
    })
  })
})
