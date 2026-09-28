import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BackendService } from '../BackendService'
import type { CredentialService } from '../CredentialService'
import type { BackendConfig } from '../../backends/types'

const { provider, getProvider } = vi.hoisted(() => {
  const provider = { validate: vi.fn() }
  return { provider, getProvider: vi.fn(() => provider) }
})

vi.mock('../../backends/BackendFactory.js', () => ({ BackendFactory: { getProvider } }))

function makeCredentialService() {
  const configs = new Map<string, BackendConfig>()
  let selected: string | null = null
  const svc = {
    getAllBackendConfigs: vi.fn(async () => [...configs.values()]),
    getBackendConfig: vi.fn(async (id: string) => configs.get(id) ?? null),
    saveBackendConfig: vi.fn(async (c: BackendConfig) => {
      configs.set(c.id, c)
    }),
    deleteBackendConfig: vi.fn(async (id: string) => {
      configs.delete(id)
    }),
    saveCredentials: vi.fn(async () => {}),
    getCredentials: vi.fn(async (): Promise<any> => null),
    deleteCredentials: vi.fn(async () => {}),
    getSelectedBackendId: vi.fn(() => selected),
    setSelectedBackendId: vi.fn((id: string | null) => {
      selected = id
    }),
  }
  return { svc, configs }
}

const baseConfig = {
  name: 'DBpedia',
  type: 'sparql-1.1',
  endpoint: 'https://dbpedia.org/sparql',
  authType: 'none',
} as Omit<BackendConfig, 'id' | 'createdAt' | 'updatedAt'>

describe('BackendService', () => {
  let creds: ReturnType<typeof makeCredentialService>
  let service: BackendService

  beforeEach(() => {
    vi.clearAllMocks()
    creds = makeCredentialService()
    service = new BackendService(creds.svc as unknown as CredentialService)
  })

  describe('createBackend', () => {
    it('assigns id and timestamps, saves, and auto-selects the first backend', async () => {
      const created = await service.createBackend(baseConfig)
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(created.createdAt).toBeTypeOf('number')
      expect(created.updatedAt).toBe(created.createdAt)
      expect(creds.svc.saveBackendConfig).toHaveBeenCalledWith(created)
      expect(creds.svc.setSelectedBackendId).toHaveBeenCalledWith(created.id)
      expect(creds.svc.saveCredentials).not.toHaveBeenCalled()
    })

    it('does not change selection when other backends exist', async () => {
      await service.createBackend(baseConfig)
      creds.svc.setSelectedBackendId.mockClear()
      await service.createBackend({ ...baseConfig, name: 'Second' })
      expect(creds.svc.setSelectedBackendId).not.toHaveBeenCalled()
    })

    it('saves credentials tagged with the new id when auth is required', async () => {
      const created = await service.createBackend(
        { ...baseConfig, authType: 'basic' },
        { backendId: '', username: 'u', password: 'p' }
      )
      expect(creds.svc.saveCredentials).toHaveBeenCalledWith(created.id, {
        backendId: created.id,
        username: 'u',
        password: 'p',
      })
    })

    it('ignores credentials when authType is none', async () => {
      await service.createBackend(baseConfig, { backendId: '', username: 'u' })
      expect(creds.svc.saveCredentials).not.toHaveBeenCalled()
    })

    it.each([
      [{ name: '' }, 'Backend name is required'],
      [{ name: '   ' }, 'Backend name is required'],
      [{ name: 'x'.repeat(51) }, 'Backend name must be 50 characters or less'],
      [{ type: '' }, 'Backend type is required'],
      [{ endpoint: ' ' }, 'Endpoint URL is required'],
      [{ endpoint: 'not a url' }, 'Invalid endpoint URL'],
      [{ endpoint: 'ftp://example.com' }, 'Endpoint must use HTTP or HTTPS protocol'],
      [{ endpoint: 'file:///etc/passwd' }, 'Endpoint must use HTTP or HTTPS protocol'],
      [{ authType: '' }, 'Authentication type is required'],
    ])('rejects invalid config %j', async (override, message) => {
      await expect(service.createBackend({ ...baseConfig, ...(override as any) })).rejects.toThrow(
        `Invalid backend configuration: ${message}`
      )
      expect(creds.svc.saveBackendConfig).not.toHaveBeenCalled()
    })

    it('accepts a 50-character name and http endpoint', async () => {
      await expect(
        service.createBackend({
          ...baseConfig,
          name: 'x'.repeat(50),
          endpoint: 'http://localhost:7200/repositories/r',
        })
      ).resolves.toBeDefined()
    })
  })

  describe('updateBackend', () => {
    let existing: BackendConfig

    beforeEach(async () => {
      existing = await service.createBackend({ ...baseConfig, authType: 'basic' })
      vi.clearAllMocks()
    })

    it('throws for an unknown backend', async () => {
      await expect(service.updateBackend('nope', { name: 'x' })).rejects.toThrow(
        'Backend not found: nope'
      )
    })

    it('merges updates but preserves id and createdAt', async () => {
      const updated = await service.updateBackend(existing.id, {
        name: 'Renamed',
        id: 'hijack',
        createdAt: 1,
      } as any)
      expect(updated.id).toBe(existing.id)
      expect(updated.createdAt).toBe(existing.createdAt)
      expect(updated.name).toBe('Renamed')
      expect(updated.updatedAt).toBeGreaterThanOrEqual(existing.updatedAt)
      expect(creds.svc.saveBackendConfig).toHaveBeenCalledWith(updated)
    })

    it('validates the merged config', async () => {
      await expect(service.updateBackend(existing.id, { endpoint: 'bad' })).rejects.toThrow(
        'Invalid backend configuration: Invalid endpoint URL'
      )
      expect(creds.svc.saveBackendConfig).not.toHaveBeenCalled()
    })

    it('saves new credentials when provided', async () => {
      await service.updateBackend(existing.id, {}, { backendId: 'x', token: 't' })
      expect(creds.svc.saveCredentials).toHaveBeenCalledWith(existing.id, {
        backendId: existing.id,
        token: 't',
      })
      expect(creds.svc.deleteCredentials).not.toHaveBeenCalled()
    })

    it('preserves existing credentials when none are provided', async () => {
      await service.updateBackend(existing.id, { name: 'Z' })
      expect(creds.svc.saveCredentials).not.toHaveBeenCalled()
      expect(creds.svc.deleteCredentials).not.toHaveBeenCalled()
    })

    it('deletes credentials when switching to authType none', async () => {
      await service.updateBackend(existing.id, { authType: 'none' }, { backendId: 'x' })
      expect(creds.svc.deleteCredentials).toHaveBeenCalledWith(existing.id)
      expect(creds.svc.saveCredentials).not.toHaveBeenCalled()
    })
  })

  describe('deleteBackend', () => {
    it('deletes an existing backend', async () => {
      const b = await service.createBackend(baseConfig)
      await service.deleteBackend(b.id)
      expect(creds.svc.deleteBackendConfig).toHaveBeenCalledWith(b.id)
      await expect(service.getBackend(b.id)).resolves.toBeNull()
    })

    it('throws for an unknown backend', async () => {
      await expect(service.deleteBackend('nope')).rejects.toThrow('Backend not found: nope')
      expect(creds.svc.deleteBackendConfig).not.toHaveBeenCalled()
    })
  })

  describe('testConnection', () => {
    it('returns an error result for an unknown backend', async () => {
      await expect(service.testConnection('nope')).resolves.toEqual({
        valid: false,
        error: 'Backend not found',
      })
    })

    it('validates via the provider with stored credentials', async () => {
      const b = await service.createBackend({ ...baseConfig, type: 'graphdb' } as any)
      const stored = { backendId: b.id, username: 'u' }
      creds.svc.getCredentials.mockResolvedValue(stored)
      provider.validate.mockResolvedValue({ valid: true })
      await expect(service.testConnection(b.id)).resolves.toEqual({ valid: true })
      expect(getProvider).toHaveBeenCalledWith('graphdb')
      expect(provider.validate).toHaveBeenCalledWith(b, stored)
    })

    it('passes undefined when no credentials are stored', async () => {
      const b = await service.createBackend(baseConfig)
      provider.validate.mockResolvedValue({ valid: true })
      await service.testConnection(b.id)
      expect(provider.validate).toHaveBeenCalledWith(b, undefined)
    })

    it('converts thrown errors into a failed result', async () => {
      const b = await service.createBackend(baseConfig)
      provider.validate.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      await expect(service.testConnection(b.id)).resolves.toEqual({
        valid: false,
        error: 'ECONNREFUSED',
      })
      getProvider.mockImplementationOnce(() => {
        throw 'weird'
      })
      await expect(service.testConnection(b.id)).resolves.toEqual({
        valid: false,
        error: 'Unknown error',
      })
    })
  })

  describe('selection', () => {
    it('selects an existing backend and reports it', async () => {
      const b = await service.createBackend(baseConfig)
      await service.selectBackend(null)
      expect(service.getSelectedBackendId()).toBeNull()
      await service.selectBackend(b.id)
      expect(service.getSelectedBackendId()).toBe(b.id)
    })

    it('refuses to select an unknown backend', async () => {
      await expect(service.selectBackend('nope')).rejects.toThrow('Backend not found: nope')
      expect(creds.svc.setSelectedBackendId).not.toHaveBeenCalled()
    })
  })

  it('getAllBackends and getCredentials delegate to the credential service', async () => {
    const b = await service.createBackend(baseConfig)
    await expect(service.getAllBackends()).resolves.toEqual([b])
    creds.svc.getCredentials.mockResolvedValue({ backendId: b.id, token: 't' })
    await expect(service.getCredentials(b.id)).resolves.toEqual({ backendId: b.id, token: 't' })
  })
})
