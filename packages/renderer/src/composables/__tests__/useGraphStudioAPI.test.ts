import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useGraphStudioAPI } from '../useGraphStudioAPI'
import type { Graphmart } from '../../types/electron'

const BASE = 'https://anzo.example.org'
const creds = { username: 'u', password: 'p' }

function gm(name: string, status: Graphmart['status']): Graphmart {
  return { uri: `urn:${name}`, name, status, layers: [] }
}

describe('useGraphStudioAPI', () => {
  let listGraphmarts: ReturnType<typeof vi.fn>
  let getGraphmartDetails: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    listGraphmarts = vi.fn()
    getGraphmartDetails = vi.fn()
    Object.assign(window, { electronAPI: { graphstudio: { listGraphmarts, getGraphmartDetails } } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Caches are module-global; clear them between tests
    useGraphStudioAPI().clearCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('loadGraphmarts', () => {
    it('sets an error when base URL is missing', async () => {
      const api = useGraphStudioAPI()
      await api.loadGraphmarts('')
      expect(api.error.value).toBe('Base URL is required')
      expect(listGraphmarts).not.toHaveBeenCalled()
    })

    it('fetches, sorts by status and exposes computed groups', async () => {
      listGraphmarts.mockResolvedValue([gm('e', 'error'), gm('i', 'inactive'), gm('a', 'active')])
      const api = useGraphStudioAPI()
      expect(api.hasGraphmarts.value).toBe(false)
      expect(api.cacheAgeSeconds.value).toBeNull()
      expect(api.cacheExpiringSoon.value).toBe(false)

      const p = api.loadGraphmarts(BASE, creds, false, true)
      expect(api.isLoading.value).toBe(true)
      await p

      expect(listGraphmarts).toHaveBeenCalledWith(BASE, creds, true)
      expect(api.isLoading.value).toBe(false)
      expect(api.error.value).toBeNull()
      expect(api.graphmarts.value.map((g) => g.name)).toEqual(['a', 'i', 'e'])
      expect(api.activeGraphmarts.value.map((g) => g.name)).toEqual(['a'])
      expect(api.inactiveGraphmarts.value.map((g) => g.name)).toEqual(['i'])
      expect(api.errorGraphmarts.value.map((g) => g.name)).toEqual(['e'])
      expect(api.hasGraphmarts.value).toBe(true)
      expect(api.lastFetched.value).toBe(Date.now())
    })

    it('serves from the shared cache within TTL, and refetches after expiry', async () => {
      listGraphmarts.mockResolvedValue([gm('a', 'active')])
      await useGraphStudioAPI().loadGraphmarts(BASE)
      expect(listGraphmarts).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(4 * 60 * 1000 + 30_000)
      const other = useGraphStudioAPI()
      await other.loadGraphmarts(BASE)
      expect(listGraphmarts).toHaveBeenCalledTimes(1)
      expect(other.graphmarts.value).toHaveLength(1)
      // cache age is computed from lastFetched (which was the original fetch)
      expect(other.cacheAgeSeconds.value).toBe(270)
      expect(other.cacheExpiringSoon.value).toBe(true)

      vi.advanceTimersByTime(60_000)
      await other.loadGraphmarts(BASE)
      expect(listGraphmarts).toHaveBeenCalledTimes(2)
    })

    it('bypasses the cache when forceRefresh is set', async () => {
      listGraphmarts.mockResolvedValue([])
      const api = useGraphStudioAPI()
      await api.loadGraphmarts(BASE)
      await api.loadGraphmarts(BASE, undefined, true)
      expect(listGraphmarts).toHaveBeenCalledTimes(2)
    })

    it('refreshGraphmarts clears the cache and refetches', async () => {
      listGraphmarts.mockResolvedValue([gm('a', 'active')])
      const api = useGraphStudioAPI()
      await api.loadGraphmarts(BASE)
      await api.refreshGraphmarts(BASE, creds, false)
      expect(listGraphmarts).toHaveBeenCalledTimes(2)
      expect(listGraphmarts).toHaveBeenLastCalledWith(BASE, creds, false)
    })

    it('records errors from the IPC call', async () => {
      listGraphmarts.mockRejectedValueOnce(new Error('401 Unauthorized'))
      const api = useGraphStudioAPI()
      await api.loadGraphmarts(BASE)
      expect(api.error.value).toBe('401 Unauthorized')
      expect(api.isLoading.value).toBe(false)

      listGraphmarts.mockRejectedValueOnce('weird')
      await api.loadGraphmarts(BASE)
      expect(api.error.value).toBe('Failed to load graphmarts')
    })
  })

  describe('getGraphmartDetails', () => {
    it('requires base URL and graphmart URI', async () => {
      const api = useGraphStudioAPI()
      await expect(api.getGraphmartDetails('', 'urn:x')).rejects.toThrow(
        'Base URL and Graphmart URI are required'
      )
      await expect(api.getGraphmartDetails(BASE, '')).rejects.toThrow()
    })

    it('fetches and caches details per graphmart', async () => {
      const details = { ...gm('a', 'active'), layers: [{ uri: 'urn:l', name: 'L', enabled: true }] }
      getGraphmartDetails.mockResolvedValue(details)
      const api = useGraphStudioAPI()

      expect(await api.getGraphmartDetails(BASE, 'urn:a', creds, true)).toEqual(details)
      expect(getGraphmartDetails).toHaveBeenCalledWith(BASE, 'urn:a', creds, true)

      expect(await api.getGraphmartDetails(BASE, 'urn:a')).toEqual(details)
      expect(getGraphmartDetails).toHaveBeenCalledTimes(1)

      await api.getGraphmartDetails(BASE, 'urn:a', undefined, undefined, true)
      expect(getGraphmartDetails).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(5 * 60 * 1000)
      await api.getGraphmartDetails(BASE, 'urn:a')
      expect(getGraphmartDetails).toHaveBeenCalledTimes(3)
    })

    it('does not cache a null result', async () => {
      getGraphmartDetails.mockResolvedValue(null)
      const api = useGraphStudioAPI()
      expect(await api.getGraphmartDetails(BASE, 'urn:a')).toBeNull()
      await api.getGraphmartDetails(BASE, 'urn:a')
      expect(getGraphmartDetails).toHaveBeenCalledTimes(2)
    })

    it('wraps errors', async () => {
      const api = useGraphStudioAPI()
      getGraphmartDetails.mockRejectedValueOnce(new Error('not found'))
      await expect(api.getGraphmartDetails(BASE, 'urn:a')).rejects.toThrow('not found')
      getGraphmartDetails.mockRejectedValueOnce(42)
      await expect(api.getGraphmartDetails(BASE, 'urn:a')).rejects.toThrow(
        'Failed to load graphmart details'
      )
    })
  })

  it('clearCache resets state and forces refetch', async () => {
    listGraphmarts.mockResolvedValue([gm('a', 'active')])
    const api = useGraphStudioAPI()
    await api.loadGraphmarts(BASE)
    api.clearCache()
    expect(api.graphmarts.value).toEqual([])
    expect(api.lastFetched.value).toBe(0)
    await api.loadGraphmarts(BASE)
    expect(listGraphmarts).toHaveBeenCalledTimes(2)
  })
})
