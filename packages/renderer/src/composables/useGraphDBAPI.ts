/**
 * Composable for GraphDB API operations with caching
 */

import { ref, computed } from 'vue'
import type {
  GraphDBRepository,
  GraphDBServerInfo,
  GraphDBRepositoryDetails,
  GraphDBAuthResponse,
  GraphDBConnectionResult,
} from '../types/electron'

// Re-export for easier importing
export type {
  GraphDBRepository,
  GraphDBServerInfo,
  GraphDBRepositoryDetails,
  GraphDBAuthResponse,
  GraphDBConnectionResult,
}

// Cache structure
interface CacheEntry<T> {
  data: T
  timestamp: number
}

interface RepositoryListCacheEntry {
  data: GraphDBRepository[]
  timestamp: number
}

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000

// Global caches (shared across all instances)
const repositoryCache = new Map<string, RepositoryListCacheEntry>()
const serverInfoCache = new Map<string, CacheEntry<GraphDBServerInfo>>()
const repositoryDetailsCache = new Map<string, CacheEntry<GraphDBRepositoryDetails>>()

export function useGraphDBAPI() {
  // State
  const repositories = ref<GraphDBRepository[]>([])
  const serverInfo = ref<GraphDBServerInfo | null>(null)

  const isLoadingRepositories = ref(false)
  const isLoadingServerInfo = ref(false)

  const error = ref<string | null>(null)

  /**
   * Check if cached data is still valid
   */
  function isCacheValid<T>(cache: Map<string, CacheEntry<T>>, key: string): boolean {
    const cached = cache.get(key)
    if (!cached) return false

    const age = Date.now() - cached.timestamp
    return age < CACHE_TTL
  }

  /**
   * Check if repository list cache is valid
   */
  function isRepositoryListCacheValid(key: string): boolean {
    const cached = repositoryCache.get(key)
    if (!cached) return false

    const age = Date.now() - cached.timestamp
    return age < CACHE_TTL
  }

  /**
   * Load repositories from cache or fetch from server
   */
  async function loadRepositories(
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

    const cacheKey = baseUrl

    // Check cache first (unless force refresh)
    if (!forceRefresh && isRepositoryListCacheValid(cacheKey)) {
      const cached = repositoryCache.get(cacheKey)
      if (cached) {
        repositories.value = cached.data
        error.value = null
        return
      }
    }

    // Fetch from server
    isLoadingRepositories.value = true
    error.value = null

    try {
      const result = await window.electronAPI.graphdb.listRepositories(
        baseUrl,
        credentials,
        allowInsecure
      )

      // Sort by title
      const sorted = [...result].sort((a, b) => a.title.localeCompare(b.title))

      // Update state
      repositories.value = sorted

      // Update cache
      repositoryCache.set(cacheKey, {
        data: sorted,
        timestamp: Date.now(),
      })

      error.value = null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load repositories'
      error.value = message
      console.error('Failed to load GraphDB repositories:', err)
    } finally {
      isLoadingRepositories.value = false
    }
  }

  /**
   * Refresh repositories (bypass cache)
   */
  async function refreshRepositories(
    baseUrl: string,
    credentials?: { username?: string; password?: string },
    allowInsecure?: boolean
  ): Promise<void> {
    // Clear cache for this URL
    repositoryCache.delete(baseUrl)

    // Load fresh data
    await loadRepositories(baseUrl, credentials, true, allowInsecure)
  }

  /**
   * Get server information
   */
  async function getServerInfo(
    baseUrl: string,
    credentials?: { username?: string; password?: string },
    forceRefresh: boolean = false,
    allowInsecure?: boolean
  ): Promise<GraphDBServerInfo | null> {
    // Validate input
    if (!baseUrl || typeof baseUrl !== 'string') {
      error.value = 'Base URL is required'
      return null
    }

    const cacheKey = baseUrl

    // Check cache first (unless force refresh)
    if (!forceRefresh && isCacheValid(serverInfoCache, cacheKey)) {
      const cached = serverInfoCache.get(cacheKey)
      if (cached) {
        serverInfo.value = cached.data
        error.value = null
        return cached.data
      }
    }

    // Fetch from server
    isLoadingServerInfo.value = true
    error.value = null

    try {
      const result = await window.electronAPI.graphdb.getServerInfo(
        baseUrl,
        credentials,
        allowInsecure
      )

      // Update state
      serverInfo.value = result

      // Update cache
      serverInfoCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      })

      error.value = null
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get server info'
      error.value = message
      console.error('Failed to get GraphDB server info:', err)
      return null
    } finally {
      isLoadingServerInfo.value = false
    }
  }

  /**
   * Get repository details (including namespaces and triple count)
   */
  async function getRepositoryDetails(
    baseUrl: string,
    repositoryId: string,
    credentials?: { username?: string; password?: string },
    forceRefresh: boolean = false,
    allowInsecure?: boolean
  ): Promise<GraphDBRepositoryDetails | null> {
    if (!baseUrl || !repositoryId) {
      throw new Error('Base URL and Repository ID are required')
    }

    // Create cache key
    const cacheKey = `${baseUrl}:${repositoryId}`

    // Check cache first (unless force refresh)
    if (!forceRefresh && isCacheValid(repositoryDetailsCache, cacheKey)) {
      const cached = repositoryDetailsCache.get(cacheKey)
      if (cached) {
        console.log(`[GraphDB] Using cached details for ${repositoryId}`)
        return cached.data
      }
    }

    try {
      const result = await window.electronAPI.graphdb.getRepositoryDetails(
        baseUrl,
        repositoryId,
        credentials,
        allowInsecure
      )

      // Cache the result
      if (result) {
        repositoryDetailsCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        })
      }

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load repository details'
      throw new Error(message)
    }
  }

  /**
   * Test connection to a GraphDB repository
   */
  async function testConnection(
    baseUrl: string,
    repositoryId: string,
    credentials?: { username?: string; password?: string },
    allowInsecure?: boolean
  ): Promise<GraphDBConnectionResult> {
    if (!baseUrl || !repositoryId) {
      return {
        success: false,
        message: 'Base URL and Repository ID are required',
      }
    }

    try {
      return await window.electronAPI.graphdb.testConnection(
        baseUrl,
        repositoryId,
        credentials,
        allowInsecure
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed'
      return {
        success: false,
        message,
      }
    }
  }

  /**
   * Authenticate with GraphDB (validate credentials)
   */
  async function authenticate(
    baseUrl: string,
    username: string,
    password: string,
    allowInsecure?: boolean
  ): Promise<void> {
    if (!baseUrl || !username || !password) {
      throw new Error('Base URL, username, and password are required')
    }

    try {
      const result = await window.electronAPI.graphdb.authenticate(
        baseUrl,
        username,
        password,
        allowInsecure
      )

      if (!result.success) {
        throw new Error('Authentication failed')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      throw new Error(message)
    }
  }

  /**
   * Clear all cached data
   */
  function clearCache(): void {
    repositoryCache.clear()
    serverInfoCache.clear()
    repositoryDetailsCache.clear()
    repositories.value = []
    serverInfo.value = null
    error.value = null
  }

  /**
   * Check if any resources are loaded
   */
  const hasRepositories = computed(() => repositories.value.length > 0)

  /**
   * Check if any operation is in progress
   */
  const isLoading = computed(() => isLoadingRepositories.value || isLoadingServerInfo.value)

  return {
    // State
    repositories,
    serverInfo,
    isLoadingRepositories,
    isLoadingServerInfo,
    isLoading,
    error,

    // Computed
    hasRepositories,

    // Methods
    loadRepositories,
    refreshRepositories,
    getServerInfo,
    getRepositoryDetails,
    testConnection,
    authenticate,
    clearCache,
  }
}
