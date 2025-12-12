/**
 * Background cache refresh composable
 * Automatically checks for and refreshes stale caches in the background
 */

import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useOntologyCacheStore } from '../stores/ontologyCache'
import { useConnectionStore } from '../stores/connection'
import { getCacheSettings } from '../services/preferences/appSettings'

/**
 * Composable for managing background cache refresh
 */
export function useCacheRefresh() {
  const cacheStore = useOntologyCacheStore()
  const connectionStore = useConnectionStore()

  const isEnabled = ref(true)
  const intervalId = ref<number | null>(null)
  const lastCheckTime = ref<number>(Date.now())
  const refreshInProgress = ref<Set<string>>(new Set())

  // Rate limiting: max 1 refresh per backend per 10 minutes
  const RATE_LIMIT_MS = 10 * 60 * 1000
  const lastRefreshTimes = ref<Map<string, number>>(new Map())

  /**
   * Check if a backend can be refreshed (rate limiting)
   */
  const canRefresh = (backendId: string): boolean => {
    const lastRefresh = lastRefreshTimes.value.get(backendId)
    if (!lastRefresh) return true
    return Date.now() - lastRefresh > RATE_LIMIT_MS
  }

  /**
   * Check all caches and refresh stale ones
   */
  const checkAndRefreshCaches = async () => {
    const settings = getCacheSettings()

    if (!settings.autoRefresh) {
      return
    }

    lastCheckTime.value = Date.now()

    try {
      // Get all cached backend IDs
      const cachedBackendIds = await cacheStore.getAllCachedBackendIds()

      // Get all backends with cache enabled
      const allBackends = connectionStore.backends
      const enabledBackends = allBackends.filter(
        (backend) => backend.cacheConfig?.enabled
      )

      // Check each enabled backend
      for (const backend of enabledBackends) {
        // Skip if already refreshing
        if (refreshInProgress.value.has(backend.id)) {
          continue
        }

        // Skip if rate limited
        if (!canRefresh(backend.id)) {
          continue
        }

        // Validate cache
        const validation = await cacheStore.validateCache(backend.id)

        // If cache is stale or doesn't exist, refresh it
        if (validation.stale || (!validation.exists && cachedBackendIds.includes(backend.id))) {
          console.log(`Background refresh: Cache for backend ${backend.name} is stale, refreshing...`)
          refreshInProgress.value.add(backend.id)
          lastRefreshTimes.value.set(backend.id, Date.now())

          // Refresh in background (don't await)
          cacheStore.smartRefresh(backend.id)
            .catch((error) => {
              console.error(`Background refresh failed for backend ${backend.name}:`, error)
            })
            .finally(() => {
              refreshInProgress.value.delete(backend.id)
            })
        }
      }
    } catch (error) {
      console.error('Error during background cache check:', error)
    }
  }

  /**
   * Start background refresh
   */
  const start = () => {
    if (intervalId.value !== null) {
      return // Already started
    }

    const settings = getCacheSettings()
    const interval = settings.refreshCheckInterval

    // Initial check
    checkAndRefreshCaches()

    // Set up periodic check
    intervalId.value = window.setInterval(() => {
      checkAndRefreshCaches()
    }, interval)

    isEnabled.value = true
    console.log(`Background cache refresh started (checking every ${interval / 1000}s)`)
  }

  /**
   * Stop background refresh
   */
  const stop = () => {
    if (intervalId.value !== null) {
      window.clearInterval(intervalId.value)
      intervalId.value = null
      isEnabled.value = false
      console.log('Background cache refresh stopped')
    }
  }

  /**
   * Manually trigger a check
   */
  const triggerCheck = async () => {
    await checkAndRefreshCaches()
  }

  /**
   * Force refresh a specific backend
   */
  const forceRefresh = async (backendId: string) => {
    if (refreshInProgress.value.has(backendId)) {
      console.warn(`Refresh already in progress for backend ${backendId}`)
      return
    }

    refreshInProgress.value.add(backendId)
    lastRefreshTimes.value.set(backendId, Date.now())

    try {
      await cacheStore.refreshCache(backendId, false)
    } finally {
      refreshInProgress.value.delete(backendId)
    }
  }

  // Computed properties
  const isRunning = computed(() => intervalId.value !== null)
  const activeRefreshes = computed(() => Array.from(refreshInProgress.value))

  // Auto-start on mount if enabled in settings
  onMounted(() => {
    const settings = getCacheSettings()
    if (settings.autoRefresh) {
      start()
    }
  })

  // Clean up on unmount
  onUnmounted(() => {
    stop()
  })

  return {
    isEnabled,
    isRunning,
    lastCheckTime,
    activeRefreshes,
    start,
    stop,
    triggerCheck,
    forceRefresh,
    canRefresh
  }
}
