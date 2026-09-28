import { describe, it, expect, vi, beforeEach } from 'vitest'

const { storeData, storeCtor } = vi.hoisted(() => {
  const storeData: Record<string, any> = {}
  const storeCtor = vi.fn(function (this: any) {
    this.get = vi.fn((key: string, def?: unknown) => (key in storeData ? storeData[key] : def))
    this.set = vi.fn((key: string, value: unknown) => {
      storeData[key] = value
    })
    return this
  })
  return { storeData, storeCtor }
})

vi.mock('electron-store', () => ({ default: storeCtor }))

import { MigrationService, getMigrationService } from '../MigrationService'

function resetStore(data: Record<string, any> = {}) {
  for (const k of Object.keys(storeData)) delete storeData[k]
  Object.assign(storeData, data)
}

describe('MigrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('uses the same store file as CredentialService (shiny-config)', () => {
    new MigrationService()
    expect(storeCtor).toHaveBeenCalledWith(expect.objectContaining({ name: 'shiny-config' }))
  })

  it('creates and selects a default DBpedia backend on first run', async () => {
    await new MigrationService().runMigrations()

    expect(storeData.backends).toHaveLength(1)
    const backend = storeData.backends[0]
    expect(backend).toMatchObject({
      name: 'DBpedia',
      type: 'sparql-1.1',
      endpoint: 'https://dbpedia.org/sparql',
      authType: 'none',
    })
    expect(backend.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(backend.createdAt).toBeTypeOf('number')
    expect(storeData.selectedBackendId).toBe(backend.id)
    expect(storeData.schemaVersion).toBe(1)
  })

  it('leaves existing backends alone but still marks the schema version', async () => {
    const existing = [{ id: 'mine', name: 'Mine' }]
    resetStore({ backends: existing, selectedBackendId: 'mine' })

    await new MigrationService().runMigrations()

    expect(storeData.backends).toBe(existing)
    expect(storeData.selectedBackendId).toBe('mine')
    expect(storeData.schemaVersion).toBe(1)
  })

  it('does nothing when the schema is already current', async () => {
    resetStore({ schemaVersion: 1 })
    const service = new MigrationService()
    await service.runMigrations()

    expect(storeData.backends).toBeUndefined()
    const instance = storeCtor.mock.instances[0] as any
    expect(instance.set).not.toHaveBeenCalled()
  })

  it('is idempotent across repeated runs', async () => {
    const service = new MigrationService()
    await service.runMigrations()
    const first = storeData.backends
    await service.runMigrations()
    expect(storeData.backends).toBe(first)
  })

  it('getMigrationService returns a singleton', () => {
    expect(getMigrationService()).toBe(getMigrationService())
    expect(getMigrationService()).toBeInstanceOf(MigrationService)
  })
})
