import { describe, it, expect, vi, beforeEach } from 'vitest'

const { CredentialService, BackendService, OntologyCacheService } = vi.hoisted(() => ({
  CredentialService: vi.fn(function (this: any) {
    this.isEncryptionAvailable = vi.fn(() => true)
  }),
  BackendService: vi.fn(function (this: any, creds: unknown) {
    this.creds = creds
  }),
  OntologyCacheService: vi.fn(function (this: any, backend: unknown) {
    this.backend = backend
  }),
}))

vi.mock('../CredentialService.js', () => ({ CredentialService }))
vi.mock('../BackendService.js', () => ({ BackendService }))
vi.mock('../OntologyCacheService.js', () => ({ OntologyCacheService }))

describe('services/index', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('getters throw before initialization', async () => {
    const services = await import('../index.js')
    const msg = 'Services not initialized. Call initializeServices() first.'
    expect(() => services.getCredentialService()).toThrow(msg)
    expect(() => services.getBackendService()).toThrow(msg)
    expect(() => services.getOntologyCacheService()).toThrow(msg)
  })

  it('wires services together and returns the same singletons', async () => {
    const services = await import('../index.js')
    services.initializeServices()

    const creds = services.getCredentialService()
    const backend = services.getBackendService()
    const cache = services.getOntologyCacheService()

    expect(creds).toBe(CredentialService.mock.instances[0])
    expect((backend as any).creds).toBe(creds)
    expect((cache as any).backend).toBe(backend)
    expect(services.getBackendService()).toBe(backend)
    expect(CredentialService).toHaveBeenCalledTimes(1)
  })
})
