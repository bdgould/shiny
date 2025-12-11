/**
 * Composable for GraphStudio API operations with caching
 */

import { ref, computed } from 'vue'
import type { Graphmart } from '../types/electron'

// Cache structure for graphmart lists
interface CacheEntry {
  data: Graphmart[]
  timestamp: number
}

// Cache structure for graphmart details (including layers)
interface DetailsCacheEntry {
  data: Graphmart
  timestamp: number
}

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000

// Global caches (shared across all instances)
const graphmartCache = new Map<string, CacheEntry>()
const graphmartDetailsCache = new Map<string, DetailsCacheEntry>()

export function useGraphStudioAPI() {
  // State
  const graphmarts = ref<Graphmart[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const lastFetched = ref<number>(0)

  /**
   * Check if cached data is still valid
   */
  function isCacheValid(baseUrl: string): boolean {
    const cached = graphmartCache.get(baseUrl)
    if (!cached) return false

    const age = Date.now() - cached.timestamp
    return age < CACHE_TTL
  }

  /**
   * Load graphmarts from cache or fetch from server
   */
  async function loadGraphmarts(
    baseUrl: string,
    credentials?: { username?: string; password?: string },
    forceRefresh: boolean = false,
    allowInsecure?: boolean
  ): Promise<void> {
    // Validate input
    if (!baseUrl || typeof baseUrl !== 'string') {
      error.value = 'Base URL is required'
      return
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh && isCacheValid(baseUrl)) {
      const cached = graphmartCache.get(baseUrl)
      if (cached) {
        graphmarts.value = cached.data
        lastFetched.value = cached.timestamp
        error.value = null
        return
      }
    }

    // Fetch from server
    isLoading.value = true
    error.value = null

    try {
      const result = await window.electronAPI.graphstudio.listGraphmarts(
        baseUrl,
        credentials,
        allowInsecure
      )

      // Sort: active first, then inactive, then error
      const sorted = [...result].sort((a, b) => {
        const statusOrder = { active: 0, inactive: 1, error: 2 }
        return statusOrder[a.status] - statusOrder[b.status]
      })

      // Update state
      graphmarts.value = sorted
      lastFetched.value = Date.now()

      // Update cache
      graphmartCache.set(baseUrl, {
        data: sorted,
        timestamp: Date.now(),
      })

      error.value = null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load graphmarts'
      error.value = message
      console.error('Failed to load graphmarts:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh graphmarts (bypass cache)
   */
  async function refreshGraphmarts(
    baseUrl: string,
    credentials?: { username?: string; password?: string },
    allowInsecure?: boolean
  ): Promise<void> {
    // Clear cache for this URL
    graphmartCache.delete(baseUrl)

    // Load fresh data
    await loadGraphmarts(baseUrl, credentials, true, allowInsecure)
  }

  /**
   * Get details for a specific graphmart (including layers)
   */
  async function getGraphmartDetails(
    baseUrl: string,
    graphmartUri: string,
    credentials?: { username?: string; password?: string },
    allowInsecure?: boolean,
    forceRefresh: boolean = false
  ): Promise<Graphmart | null> {
    if (!baseUrl || !graphmartUri) {
      throw new Error('Base URL and Graphmart URI are required')
    }

    // Create cache key
    const cacheKey = `${baseUrl}:${graphmartUri}`

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = graphmartDetailsCache.get(cacheKey)
      if (cached) {
        const age = Date.now() - cached.timestamp
        if (age < CACHE_TTL) {
          console.log(`[GraphStudio] Using cached details for ${graphmartUri}`)
          return cached.data
        }
      }
    }

    try {
      const result = await window.electronAPI.graphstudio.getGraphmartDetails(
        baseUrl,
        graphmartUri,
        credentials,
        allowInsecure
      )

      // Cache the result
      if (result) {
        graphmartDetailsCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        })
      }

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load graphmart details'
      throw new Error(message)
    }
  }

  /**
   * Clear all cached data
   */
  function clearCache(): void {
    graphmartCache.clear()
    graphmartDetailsCache.clear()
    graphmarts.value = []
    lastFetched.value = 0
    error.value = null
  }

  /**
   * Get cache age in seconds
   */
  const cacheAgeSeconds = computed(() => {
    if (!lastFetched.value) return null
    return Math.floor((Date.now() - lastFetched.value) / 1000)
  })

  /**
   * Check if cache will expire soon (within 1 minute)
   */
  const cacheExpiringSoon = computed(() => {
    if (!lastFetched.value) return false
    const age = Date.now() - lastFetched.value
    return age > CACHE_TTL - 60000 // Less than 1 minute remaining
  })

  /**
   * Get graphmarts by status
   */
  const activeGraphmarts = computed(() => graphmarts.value.filter((gm) => gm.status === 'active'))

  const inactiveGraphmarts = computed(() =>
    graphmarts.value.filter((gm) => gm.status === 'inactive')
  )

  const errorGraphmarts = computed(() => graphmarts.value.filter((gm) => gm.status === 'error'))

  /**
   * Check if any graphmarts are available
   */
  const hasGraphmarts = computed(() => graphmarts.value.length > 0)

  return {
    // State
    graphmarts,
    isLoading,
    error,
    lastFetched,

    // Computed
    cacheAgeSeconds,
    cacheExpiringSoon,
    activeGraphmarts,
    inactiveGraphmarts,
    errorGraphmarts,
    hasGraphmarts,

    // Methods
    loadGraphmarts,
    refreshGraphmarts,
    getGraphmartDetails,
    clearCache,
  }
}
