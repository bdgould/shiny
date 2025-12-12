import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCacheRefresh } from '../useCacheRefresh'
import { useOntologyCacheStore } from '../../stores/ontologyCache'
import { useConnectionStore } from '../../stores/connection'
import * as appSettings from '../../services/preferences/appSettings'

// Mock window.setInterval and clearInterval
vi.useFakeTimers()

// Mock app settings
vi.mock('../../services/preferences/appSettings', () => ({
  getCacheSettings: vi.fn(() => ({
    autoRefresh: true,
    refreshCheckInterval: 300000 // 5 minutes
  }))
}))

describe('useCacheRefresh', () => {
  let cacheStore: ReturnType<typeof useOntologyCacheStore>
  let connectionStore: ReturnType<typeof useConnectionStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.clearAllTimers()

    cacheStore = useOntologyCacheStore()
    connectionStore = useConnectionStore()

    // Setup default mocks
    vi.spyOn(cacheStore, 'getAllCachedBackendIds').mockResolvedValue([])
    vi.spyOn(cacheStore, 'validateCache').mockResolvedValue({
      exists: false,
      valid: false,
      stale: false
    })
    vi.spyOn(cacheStore, 'smartRefresh').mockResolvedValue({} as any)
    vi.spyOn(cacheStore, 'refreshCache').mockResolvedValue({} as any)

    // Setup default backends
    connectionStore.backends = []
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('initialization', () => {
    it('should not auto-start if autoRefresh is disabled', () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: false,
        refreshCheckInterval: 300000
      })

      const { isRunning, start } = useCacheRefresh()

      expect(isRunning.value).toBe(false)

      // Manually start since onMounted doesn't run in tests
      start()

      // Should still not call getAllCachedBackendIds because autoRefresh is false
      expect(cacheStore.getAllCachedBackendIds).not.toHaveBeenCalled()
    })

    it('should auto-start if autoRefresh is enabled', () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000
      })

      const { isRunning, start } = useCacheRefresh()

      expect(isRunning.value).toBe(false) // Not started yet (onMounted doesn't run in tests)

      // Manually trigger start (simulating onMounted)
      start()

      expect(isRunning.value).toBe(true)
      expect(cacheStore.getAllCachedBackendIds).toHaveBeenCalled()
    })
  })

  describe('start and stop', () => {
    it('should start background refresh', () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true, // Must be true for checkAndRefreshCaches to actually run
        refreshCheckInterval: 300000
      })

      const { start, isRunning } = useCacheRefresh()

      expect(isRunning.value).toBe(false)

      start()

      expect(isRunning.value).toBe(true)
      expect(cacheStore.getAllCachedBackendIds).toHaveBeenCalled()
    })

    it('should stop background refresh', () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: false,
        refreshCheckInterval: 300000
      })

      const { start, stop, isRunning } = useCacheRefresh()

      start()
      expect(isRunning.value).toBe(true)

      stop()
      expect(isRunning.value).toBe(false)
    })

    it('should not start multiple times', () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true, // Need this to be true for start() to actually call getAllCachedBackendIds
        refreshCheckInterval: 300000
      })

      const { start } = useCacheRefresh()

      vi.mocked(cacheStore.getAllCachedBackendIds).mockClear()

      start()
      expect(cacheStore.getAllCachedBackendIds).toHaveBeenCalledTimes(1)

      start()
      expect(cacheStore.getAllCachedBackendIds).toHaveBeenCalledTimes(1) // Not called again
    })
  })

  describe('periodic checks', () => {
    it('should run checks at configured interval', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000 // 5 minutes
      })

      const { start } = useCacheRefresh()

      vi.mocked(cacheStore.getAllCachedBackendIds).mockClear()

      start()

      // Initial check
      expect(cacheStore.getAllCachedBackendIds).toHaveBeenCalledTimes(1)

      // Advance by 5 minutes
      await vi.advanceTimersByTimeAsync(300000)
      expect(cacheStore.getAllCachedBackendIds).toHaveBeenCalledTimes(2)

      // Advance by another 5 minutes
      await vi.advanceTimersByTimeAsync(300000)
      expect(cacheStore.getAllCachedBackendIds).toHaveBeenCalledTimes(3)
    })
  })

  describe('checkAndRefreshCaches', () => {
    it('should skip if autoRefresh is disabled', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: false,
        refreshCheckInterval: 300000
      })

      const { triggerCheck } = useCacheRefresh()

      await triggerCheck()

      expect(cacheStore.getAllCachedBackendIds).not.toHaveBeenCalled()
    })

    it('should refresh stale caches', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000
      })

      connectionStore.backends = [
        {
          id: 'backend-1',
          name: 'Backend 1',
          type: 'sparql11',
          endpoint: 'http://example.org/sparql',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cacheConfig: {
            enabled: true,
            maxElements: 10000,
            ttl: 86400000,
            includeClasses: true,
            includeProperties: true,
            includeIndividuals: true
          }
        }
      ]

      vi.mocked(cacheStore.getAllCachedBackendIds).mockResolvedValue(['backend-1'])
      vi.mocked(cacheStore.validateCache).mockResolvedValue({
        exists: true,
        valid: false,
        stale: true,
        age: 90000000,
        ttl: 86400000
      })

      const { triggerCheck } = useCacheRefresh()

      await triggerCheck()

      expect(cacheStore.smartRefresh).toHaveBeenCalledWith('backend-1')
    })

    it('should skip backends without cache enabled', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000
      })

      connectionStore.backends = [
        {
          id: 'backend-1',
          name: 'Backend 1',
          type: 'sparql11',
          endpoint: 'http://example.org/sparql',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cacheConfig: {
            enabled: false,
            maxElements: 10000,
            ttl: 86400000,
            includeClasses: true,
            includeProperties: true,
            includeIndividuals: true
          }
        }
      ]

      const { triggerCheck } = useCacheRefresh()

      await triggerCheck()

      expect(cacheStore.validateCache).not.toHaveBeenCalled()
      expect(cacheStore.smartRefresh).not.toHaveBeenCalled()
    })

    it('should skip valid caches', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000
      })

      connectionStore.backends = [
        {
          id: 'backend-1',
          name: 'Backend 1',
          type: 'sparql11',
          endpoint: 'http://example.org/sparql',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cacheConfig: {
            enabled: true,
            maxElements: 10000,
            ttl: 86400000,
            includeClasses: true,
            includeProperties: true,
            includeIndividuals: true
          }
        }
      ]

      vi.mocked(cacheStore.getAllCachedBackendIds).mockResolvedValue(['backend-1'])
      vi.mocked(cacheStore.validateCache).mockResolvedValue({
        exists: true,
        valid: true,
        stale: false,
        age: 1000,
        ttl: 86400000
      })

      const { triggerCheck } = useCacheRefresh()

      await triggerCheck()

      expect(cacheStore.smartRefresh).not.toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000
      })

      connectionStore.backends = [
        {
          id: 'backend-1',
          name: 'Backend 1',
          type: 'sparql11',
          endpoint: 'http://example.org/sparql',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cacheConfig: {
            enabled: true,
            maxElements: 10000,
            ttl: 86400000,
            includeClasses: true,
            includeProperties: true,
            includeIndividuals: true
          }
        }
      ]

      vi.mocked(cacheStore.getAllCachedBackendIds).mockRejectedValue(new Error('DB error'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { triggerCheck } = useCacheRefresh()

      await triggerCheck()

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error during background cache check:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  describe('rate limiting', () => {
    it('should enforce rate limit', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000
      })

      connectionStore.backends = [
        {
          id: 'backend-1',
          name: 'Backend 1',
          type: 'sparql11',
          endpoint: 'http://example.org/sparql',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cacheConfig: {
            enabled: true,
            maxElements: 10000,
            ttl: 86400000,
            includeClasses: true,
            includeProperties: true,
            includeIndividuals: true
          }
        }
      ]

      vi.mocked(cacheStore.getAllCachedBackendIds).mockResolvedValue(['backend-1'])
      vi.mocked(cacheStore.validateCache).mockResolvedValue({
        exists: true,
        valid: false,
        stale: true
      })

      const { triggerCheck, canRefresh } = useCacheRefresh()

      // First refresh should work
      expect(canRefresh('backend-1')).toBe(true)

      await triggerCheck()
      // Wait for async operations to complete
      await vi.waitFor(() => {
        expect(cacheStore.smartRefresh).toHaveBeenCalledTimes(1)
      })

      // Immediately after, should be rate limited
      await vi.waitFor(() => {
        expect(canRefresh('backend-1')).toBe(false)
      })

      await triggerCheck()
      expect(cacheStore.smartRefresh).toHaveBeenCalledTimes(1) // Not called again

      // Advance by 10 minutes
      vi.setSystemTime(Date.now() + 10 * 60 * 1000)

      // Should allow refresh again
      expect(canRefresh('backend-1')).toBe(true)

      await triggerCheck()
      await vi.waitFor(() => {
        expect(cacheStore.smartRefresh).toHaveBeenCalledTimes(2)
      })
    })

    it('should not refresh if already in progress', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000
      })

      connectionStore.backends = [
        {
          id: 'backend-1',
          name: 'Backend 1',
          type: 'sparql11',
          endpoint: 'http://example.org/sparql',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cacheConfig: {
            enabled: true,
            maxElements: 10000,
            ttl: 86400000,
            includeClasses: true,
            includeProperties: true,
            includeIndividuals: true
          }
        }
      ]

      vi.mocked(cacheStore.getAllCachedBackendIds).mockResolvedValue(['backend-1'])
      vi.mocked(cacheStore.validateCache).mockResolvedValue({
        exists: true,
        valid: false,
        stale: true
      })

      // Make smartRefresh take a long time
      let refreshResolve: any
      vi.mocked(cacheStore.smartRefresh).mockImplementation(() => {
        return new Promise((resolve) => {
          refreshResolve = resolve
        })
      })

      const { triggerCheck, activeRefreshes } = useCacheRefresh()

      // Start first refresh
      const check1 = triggerCheck()

      // Wait for the async operations to start (validateCache, etc.)
      await vi.waitFor(() => {
        expect(activeRefreshes.value).toContain('backend-1')
      })

      // Try second refresh while first is in progress
      await triggerCheck()

      // Should still only have one call
      expect(cacheStore.smartRefresh).toHaveBeenCalledTimes(1)

      // Complete the refresh
      refreshResolve({})
      await check1

      // Wait for cleanup
      await vi.waitFor(() => {
        expect(activeRefreshes.value).not.toContain('backend-1')
      })
    })
  })

  describe('forceRefresh', () => {
    it('should force refresh a specific backend', async () => {
      const { forceRefresh } = useCacheRefresh()

      await forceRefresh('backend-1')

      expect(cacheStore.refreshCache).toHaveBeenCalledWith('backend-1', false)
    })

    it('should not force refresh if already in progress', async () => {
      const { forceRefresh, activeRefreshes } = useCacheRefresh()

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Make first refresh take time
      let refreshResolve: any
      vi.mocked(cacheStore.refreshCache).mockImplementation(() => {
        return new Promise((resolve) => {
          refreshResolve = resolve
        })
      })

      // Start first refresh
      const refresh1 = forceRefresh('backend-1')

      // Wait a bit
      await Promise.resolve()

      expect(activeRefreshes.value).toContain('backend-1')

      // Try second refresh
      await forceRefresh('backend-1')

      expect(consoleSpy).toHaveBeenCalledWith(
        'Refresh already in progress for backend backend-1'
      )

      // Complete first refresh
      refreshResolve({})
      await refresh1

      consoleSpy.mockRestore()
    })

    it('should clean up after error', async () => {
      const { forceRefresh, activeRefreshes } = useCacheRefresh()

      vi.mocked(cacheStore.refreshCache).mockRejectedValue(new Error('Refresh failed'))

      await expect(forceRefresh('backend-1')).rejects.toThrow('Refresh failed')

      // Should clean up active refresh flag
      expect(activeRefreshes.value).not.toContain('backend-1')
    })
  })

  describe('lastCheckTime', () => {
    it('should update lastCheckTime on check', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000
      })

      const { triggerCheck, lastCheckTime } = useCacheRefresh()

      const timeBefore = Date.now()
      await triggerCheck()
      const timeAfter = Date.now()

      expect(lastCheckTime.value).toBeGreaterThanOrEqual(timeBefore)
      expect(lastCheckTime.value).toBeLessThanOrEqual(timeAfter)
    })
  })

  describe('multiple backends', () => {
    it('should handle multiple backends correctly', async () => {
      vi.mocked(appSettings.getCacheSettings).mockReturnValue({
        autoRefresh: true,
        refreshCheckInterval: 300000
      })

      connectionStore.backends = [
        {
          id: 'backend-1',
          name: 'Backend 1',
          type: 'sparql11',
          endpoint: 'http://example.org/sparql',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cacheConfig: {
            enabled: true,
            maxElements: 10000,
            ttl: 86400000,
            includeClasses: true,
            includeProperties: true,
            includeIndividuals: true
          }
        },
        {
          id: 'backend-2',
          name: 'Backend 2',
          type: 'sparql11',
          endpoint: 'http://example2.org/sparql',
          authType: 'none',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cacheConfig: {
            enabled: true,
            maxElements: 10000,
            ttl: 86400000,
            includeClasses: true,
            includeProperties: true,
            includeIndividuals: true
          }
        }
      ]

      vi.mocked(cacheStore.getAllCachedBackendIds).mockResolvedValue(['backend-1', 'backend-2'])
      vi.mocked(cacheStore.validateCache).mockImplementation(async (backendId) => ({
        exists: true,
        valid: false,
        stale: true
      }))

      const { triggerCheck } = useCacheRefresh()

      await triggerCheck()

      expect(cacheStore.smartRefresh).toHaveBeenCalledWith('backend-1')
      expect(cacheStore.smartRefresh).toHaveBeenCalledWith('backend-2')
    })
  })
})
