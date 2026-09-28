import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useGraphDBAPI, type GraphDBRepository } from '../useGraphDBAPI'

const BASE = 'http://graphdb.example.org:7200'
const creds = { username: 'admin', password: 'root' }

function repo(id: string, title: string): GraphDBRepository {
  return {
    id,
    title,
    uri: `${BASE}/repositories/${id}`,
    readable: true,
    writable: true,
    type: 'free',
  }
}

describe('useGraphDBAPI', () => {
  let api: ReturnType<typeof useGraphDBAPI>
  const ipc = {
    listRepositories: vi.fn(),
    getServerInfo: vi.fn(),
    getRepositoryDetails: vi.fn(),
    testConnection: vi.fn(),
    authenticate: vi.fn(),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    Object.values(ipc).forEach((fn) => fn.mockReset())
    Object.assign(window, { electronAPI: { graphdb: ipc } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api = useGraphDBAPI()
    api.clearCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('loadRepositories', () => {
    it('requires a base URL', async () => {
      await api.loadRepositories('')
      expect(api.error.value).toBe('Base URL is required')
      expect(ipc.listRepositories).not.toHaveBeenCalled()
    })

    it('fetches and sorts repositories by title', async () => {
      ipc.listRepositories.mockResolvedValue([
        repo('z', 'Zeta'),
        repo('a', 'alpha'),
        repo('m', 'Mu'),
      ])
      const p = api.loadRepositories(BASE, creds, false, true)
      expect(api.isLoadingRepositories.value).toBe(true)
      expect(api.isLoading.value).toBe(true)
      await p
      expect(ipc.listRepositories).toHaveBeenCalledWith(BASE, creds, true)
      expect(api.repositories.value.map((r) => r.title)).toEqual(['alpha', 'Mu', 'Zeta'])
      expect(api.hasRepositories.value).toBe(true)
      expect(api.isLoading.value).toBe(false)
    })

    it('uses the shared cache until TTL expires', async () => {
      ipc.listRepositories.mockResolvedValue([repo('a', 'A')])
      await api.loadRepositories(BASE)
      const other = useGraphDBAPI()
      await other.loadRepositories(BASE)
      expect(other.repositories.value).toHaveLength(1)
      expect(ipc.listRepositories).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(5 * 60 * 1000)
      await other.loadRepositories(BASE)
      expect(ipc.listRepositories).toHaveBeenCalledTimes(2)
    })

    it('refreshRepositories bypasses the cache', async () => {
      ipc.listRepositories.mockResolvedValue([])
      await api.loadRepositories(BASE)
      await api.refreshRepositories(BASE, creds, true)
      expect(ipc.listRepositories).toHaveBeenCalledTimes(2)
      expect(ipc.listRepositories).toHaveBeenLastCalledWith(BASE, creds, true)
    })

    it('records errors', async () => {
      ipc.listRepositories.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      await api.loadRepositories(BASE)
      expect(api.error.value).toBe('ECONNREFUSED')
      ipc.listRepositories.mockRejectedValueOnce(null)
      await api.loadRepositories(BASE)
      expect(api.error.value).toBe('Failed to load repositories')
      expect(api.isLoadingRepositories.value).toBe(false)
    })
  })

  describe('getServerInfo', () => {
    const info = {
      productName: 'GraphDB',
      productVersion: '10.6.0',
      versionFamily: '10.x' as const,
    }

    it('requires a base URL', async () => {
      expect(await api.getServerInfo('')).toBeNull()
      expect(api.error.value).toBe('Base URL is required')
    })

    it('fetches, caches and supports force refresh', async () => {
      ipc.getServerInfo.mockResolvedValue(info)
      const p = api.getServerInfo(BASE, creds, false, true)
      expect(api.isLoadingServerInfo.value).toBe(true)
      expect(await p).toEqual(info)
      expect(ipc.getServerInfo).toHaveBeenCalledWith(BASE, creds, true)
      expect(api.serverInfo.value).toEqual(info)

      const other = useGraphDBAPI()
      expect(await other.getServerInfo(BASE)).toEqual(info)
      expect(other.serverInfo.value).toEqual(info)
      expect(ipc.getServerInfo).toHaveBeenCalledTimes(1)

      await other.getServerInfo(BASE, undefined, true)
      expect(ipc.getServerInfo).toHaveBeenCalledTimes(2)
    })

    it('returns null and records errors', async () => {
      ipc.getServerInfo.mockRejectedValueOnce(new Error('timeout'))
      expect(await api.getServerInfo(BASE)).toBeNull()
      expect(api.error.value).toBe('timeout')
      ipc.getServerInfo.mockRejectedValueOnce('x')
      expect(await api.getServerInfo(BASE)).toBeNull()
      expect(api.error.value).toBe('Failed to get server info')
      expect(api.isLoadingServerInfo.value).toBe(false)
    })
  })

  describe('getRepositoryDetails', () => {
    const details = {
      repositoryId: 'r1',
      namespaces: [{ prefix: 'ex', namespace: 'http://ex.org/' }],
    }

    it('requires base URL and repository ID', async () => {
      await expect(api.getRepositoryDetails('', 'r1')).rejects.toThrow(
        'Base URL and Repository ID are required'
      )
      await expect(api.getRepositoryDetails(BASE, '')).rejects.toThrow()
    })

    it('fetches and caches per repository', async () => {
      ipc.getRepositoryDetails.mockResolvedValue(details)
      expect(await api.getRepositoryDetails(BASE, 'r1', creds, false, true)).toEqual(details)
      expect(ipc.getRepositoryDetails).toHaveBeenCalledWith(BASE, 'r1', creds, true)
      expect(await api.getRepositoryDetails(BASE, 'r1')).toEqual(details)
      expect(ipc.getRepositoryDetails).toHaveBeenCalledTimes(1)

      await api.getRepositoryDetails(BASE, 'r2')
      expect(ipc.getRepositoryDetails).toHaveBeenCalledTimes(2)

      await api.getRepositoryDetails(BASE, 'r1', undefined, true)
      expect(ipc.getRepositoryDetails).toHaveBeenCalledTimes(3)
    })

    it('does not cache null and wraps errors', async () => {
      ipc.getRepositoryDetails.mockResolvedValueOnce(null)
      expect(await api.getRepositoryDetails(BASE, 'r1')).toBeNull()
      ipc.getRepositoryDetails.mockRejectedValueOnce(new Error('404'))
      await expect(api.getRepositoryDetails(BASE, 'r1')).rejects.toThrow('404')
      ipc.getRepositoryDetails.mockRejectedValueOnce({})
      await expect(api.getRepositoryDetails(BASE, 'r1')).rejects.toThrow(
        'Failed to load repository details'
      )
    })
  })

  describe('testConnection', () => {
    it('validates required args without calling IPC', async () => {
      expect(await api.testConnection('', 'r1')).toEqual({
        success: false,
        message: 'Base URL and Repository ID are required',
      })
      expect(ipc.testConnection).not.toHaveBeenCalled()
    })

    it('returns the IPC result', async () => {
      ipc.testConnection.mockResolvedValue({ success: true, message: 'OK' })
      expect(await api.testConnection(BASE, 'r1', creds, true)).toEqual({
        success: true,
        message: 'OK',
      })
      expect(ipc.testConnection).toHaveBeenCalledWith(BASE, 'r1', creds, true)
    })

    it('converts thrown errors to a failed result', async () => {
      ipc.testConnection.mockRejectedValueOnce(new Error('refused'))
      expect(await api.testConnection(BASE, 'r1')).toEqual({ success: false, message: 'refused' })
      ipc.testConnection.mockRejectedValueOnce('?')
      expect(await api.testConnection(BASE, 'r1')).toEqual({
        success: false,
        message: 'Connection test failed',
      })
    })
  })

  describe('authenticate', () => {
    it('requires all credentials', async () => {
      await expect(api.authenticate(BASE, '', 'p')).rejects.toThrow(
        'Base URL, username, and password are required'
      )
    })

    it('resolves on success', async () => {
      ipc.authenticate.mockResolvedValue({ success: true, token: 't' })
      await expect(api.authenticate(BASE, 'u', 'p', true)).resolves.toBeUndefined()
      expect(ipc.authenticate).toHaveBeenCalledWith(BASE, 'u', 'p', true)
    })

    it('throws when the server rejects credentials', async () => {
      ipc.authenticate.mockResolvedValue({ success: false })
      await expect(api.authenticate(BASE, 'u', 'bad')).rejects.toThrow('Authentication failed')
    })

    it('wraps IPC errors', async () => {
      ipc.authenticate.mockRejectedValueOnce(new Error('network'))
      await expect(api.authenticate(BASE, 'u', 'p')).rejects.toThrow('network')
      ipc.authenticate.mockRejectedValueOnce(0)
      await expect(api.authenticate(BASE, 'u', 'p')).rejects.toThrow('Authentication failed')
    })
  })

  it('clearCache resets state', async () => {
    ipc.listRepositories.mockResolvedValue([repo('a', 'A')])
    ipc.getServerInfo.mockResolvedValue({
      productName: 'G',
      productVersion: '1',
      versionFamily: 'unknown',
    })
    await api.loadRepositories(BASE)
    await api.getServerInfo(BASE)
    api.clearCache()
    expect(api.repositories.value).toEqual([])
    expect(api.serverInfo.value).toBeNull()
    expect(api.error.value).toBeNull()
    await api.loadRepositories(BASE)
    expect(ipc.listRepositories).toHaveBeenCalledTimes(2)
  })
})
