import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useMobiAPI, type MobiRecord } from '../useMobiAPI'

const BASE = 'https://mobi.example.org'
const creds = { username: 'admin', password: 'admin' }
const ONTOLOGY = 'http://mobi.com/ontologies/ontology-editor#OntologyRecord'

function record(id: string, title: string): MobiRecord {
  return { id, iri: `urn:${id}`, title, type: ONTOLOGY }
}

describe('useMobiAPI', () => {
  let api: ReturnType<typeof useMobiAPI>
  const ipc = {
    listCatalogs: vi.fn(),
    listRepositories: vi.fn(),
    listRecords: vi.fn(),
    listBranches: vi.fn(),
    authenticate: vi.fn(),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    Object.values(ipc).forEach((fn) => fn.mockReset())
    Object.assign(window, { electronAPI: { mobi: ipc } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api = useMobiAPI()
    api.clearCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('loadCatalogs', () => {
    it('requires a base URL', async () => {
      await api.loadCatalogs('')
      expect(api.error.value).toBe('Base URL is required')
    })

    it('fetches and caches catalogs', async () => {
      const catalogs = [{ id: 'c1', iri: 'urn:c1', title: 'Local', type: 'local' as const }]
      ipc.listCatalogs.mockResolvedValue(catalogs)
      const p = api.loadCatalogs(BASE, creds, false, true)
      expect(api.isLoadingCatalogs.value).toBe(true)
      expect(api.isLoading.value).toBe(true)
      await p
      expect(ipc.listCatalogs).toHaveBeenCalledWith(BASE, creds, true)
      expect(api.catalogs.value).toEqual(catalogs)
      expect(api.hasCatalogs.value).toBe(true)
      expect(api.isLoading.value).toBe(false)

      const other = useMobiAPI()
      await other.loadCatalogs(BASE)
      expect(other.catalogs.value).toEqual(catalogs)
      expect(ipc.listCatalogs).toHaveBeenCalledTimes(1)

      await other.loadCatalogs(BASE, undefined, true)
      expect(ipc.listCatalogs).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(5 * 60 * 1000)
      await other.loadCatalogs(BASE)
      expect(ipc.listCatalogs).toHaveBeenCalledTimes(3)
    })

    it('records errors', async () => {
      ipc.listCatalogs.mockRejectedValueOnce(new Error('401'))
      await api.loadCatalogs(BASE)
      expect(api.error.value).toBe('401')
      ipc.listCatalogs.mockRejectedValueOnce('x')
      await api.loadCatalogs(BASE)
      expect(api.error.value).toBe('Failed to load catalogs')
      expect(api.isLoadingCatalogs.value).toBe(false)
    })
  })

  describe('loadRepositories', () => {
    it('requires a base URL', async () => {
      await api.loadRepositories('')
      expect(api.error.value).toBe('Base URL is required')
    })

    it('fetches and caches repositories', async () => {
      const repos = [{ id: 'system', iri: 'urn:system', title: 'System' }]
      ipc.listRepositories.mockResolvedValue(repos)
      await api.loadRepositories(BASE, creds, false, false)
      expect(ipc.listRepositories).toHaveBeenCalledWith(BASE, creds, false)
      expect(api.repositories.value).toEqual(repos)
      expect(api.hasRepositories.value).toBe(true)

      const other = useMobiAPI()
      await other.loadRepositories(BASE)
      expect(other.repositories.value).toEqual(repos)
      expect(ipc.listRepositories).toHaveBeenCalledTimes(1)
    })

    it('records errors', async () => {
      ipc.listRepositories.mockRejectedValueOnce(new Error('boom'))
      await api.loadRepositories(BASE)
      expect(api.error.value).toBe('boom')
      ipc.listRepositories.mockRejectedValueOnce(undefined)
      await api.loadRepositories(BASE)
      expect(api.error.value).toBe('Failed to load repositories')
    })
  })

  describe('loadRecords', () => {
    it('validates base URL and catalog ID', async () => {
      await api.loadRecords('', 'c1')
      expect(api.error.value).toBe('Base URL is required')
      await api.loadRecords(BASE, '')
      expect(api.error.value).toBe('Catalog ID is required')
      expect(ipc.listRecords).not.toHaveBeenCalled()
    })

    it('fetches, sorts and caches records keyed by record types', async () => {
      ipc.listRecords.mockResolvedValue([record('b', 'beta'), record('a', 'Alpha')])
      await api.loadRecords(BASE, 'c1', [ONTOLOGY], creds, false, true)
      expect(ipc.listRecords).toHaveBeenCalledWith(BASE, 'c1', [ONTOLOGY], creds, true)
      expect(api.records.value.map((r) => r.title)).toEqual(['Alpha', 'beta'])
      expect(api.hasRecords.value).toBe(true)

      // Same key -> cached
      await api.loadRecords(BASE, 'c1', [ONTOLOGY])
      expect(ipc.listRecords).toHaveBeenCalledTimes(1)

      // Different record-type filter -> separate cache entry
      await api.loadRecords(BASE, 'c1')
      expect(ipc.listRecords).toHaveBeenCalledTimes(2)

      await api.loadRecords(BASE, 'c1', undefined, undefined, true)
      expect(ipc.listRecords).toHaveBeenCalledTimes(3)
    })

    it('records errors', async () => {
      ipc.listRecords.mockRejectedValueOnce(new Error('bad catalog'))
      await api.loadRecords(BASE, 'c1')
      expect(api.error.value).toBe('bad catalog')
      ipc.listRecords.mockRejectedValueOnce(1)
      await api.loadRecords(BASE, 'c1')
      expect(api.error.value).toBe('Failed to load records')
      expect(api.isLoadingRecords.value).toBe(false)
    })
  })

  describe('loadBranches', () => {
    it('validates required arguments', async () => {
      await api.loadBranches('', 'c', 'r')
      expect(api.error.value).toBe('Base URL is required')
      await api.loadBranches(BASE, '', 'r')
      expect(api.error.value).toBe('Catalog ID is required')
      await api.loadBranches(BASE, 'c', '')
      expect(api.error.value).toBe('Record ID is required')
      expect(ipc.listBranches).not.toHaveBeenCalled()
    })

    it('fetches and caches branches, preserving server order', async () => {
      const branches = [
        { id: 'm', iri: 'urn:m', title: 'MASTER' },
        { id: 'a', iri: 'urn:a', title: 'a-feature' },
      ]
      ipc.listBranches.mockResolvedValue(branches)
      await api.loadBranches(BASE, 'c', 'r', creds, false, true)
      expect(ipc.listBranches).toHaveBeenCalledWith(BASE, 'c', 'r', creds, true)
      expect(api.branches.value.map((b) => b.title)).toEqual(['MASTER', 'a-feature'])
      expect(api.hasBranches.value).toBe(true)

      await api.loadBranches(BASE, 'c', 'r')
      expect(ipc.listBranches).toHaveBeenCalledTimes(1)
      await api.loadBranches(BASE, 'c', 'r2')
      expect(ipc.listBranches).toHaveBeenCalledTimes(2)
    })

    it('records errors', async () => {
      ipc.listBranches.mockRejectedValueOnce(new Error('gone'))
      await api.loadBranches(BASE, 'c', 'r')
      expect(api.error.value).toBe('gone')
      ipc.listBranches.mockRejectedValueOnce(null)
      await api.loadBranches(BASE, 'c', 'r')
      expect(api.error.value).toBe('Failed to load branches')
      expect(api.isLoadingBranches.value).toBe(false)
    })
  })

  describe('authenticate', () => {
    it('requires all credentials', async () => {
      await expect(api.authenticate(BASE, 'u', '')).rejects.toThrow(
        'Base URL, username, and password are required'
      )
      expect(ipc.authenticate).not.toHaveBeenCalled()
    })

    it('calls IPC and resolves', async () => {
      ipc.authenticate.mockResolvedValue({ username: 'u' })
      await expect(api.authenticate(BASE, 'u', 'p', true)).resolves.toBeUndefined()
      expect(ipc.authenticate).toHaveBeenCalledWith(BASE, 'u', 'p', true)
    })

    it('wraps IPC errors', async () => {
      ipc.authenticate.mockRejectedValueOnce(new Error('Invalid credentials'))
      await expect(api.authenticate(BASE, 'u', 'p')).rejects.toThrow('Invalid credentials')
      ipc.authenticate.mockRejectedValueOnce('?')
      await expect(api.authenticate(BASE, 'u', 'p')).rejects.toThrow('Authentication failed')
    })
  })

  it('clearCache resets all state and caches', async () => {
    ipc.listCatalogs.mockResolvedValue([{ id: 'c', iri: 'urn:c', title: 'C' }])
    await api.loadCatalogs(BASE)
    api.error.value = 'stale'
    api.clearCache()
    expect(api.catalogs.value).toEqual([])
    expect(api.repositories.value).toEqual([])
    expect(api.records.value).toEqual([])
    expect(api.branches.value).toEqual([])
    expect(api.error.value).toBeNull()
    await api.loadCatalogs(BASE)
    expect(ipc.listCatalogs).toHaveBeenCalledTimes(2)
  })
})
