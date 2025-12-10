/**
 * Composable for Mobi API operations with caching
 */

import { ref, computed } from 'vue'
import type { MobiCatalog, MobiRecord, MobiBranch, MobiRepository } from '../types/electron'

// Re-export for easier importing
export type { MobiCatalog, MobiRecord, MobiBranch, MobiRepository }

// Cache structure
interface CacheEntry<T> {
  data: T[]
  timestamp: number
}

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000

// Global caches (shared across all instances)
const catalogCache = new Map<string, CacheEntry<MobiCatalog>>()
const repositoryCache = new Map<string, CacheEntry<MobiRepository>>()
const recordCache = new Map<string, CacheEntry<MobiRecord>>()
const branchCache = new Map<string, CacheEntry<MobiBranch>>()

export function useMobiAPI() {
  // State
  const catalogs = ref<MobiCatalog[]>([])
  const repositories = ref<MobiRepository[]>([])
  const records = ref<MobiRecord[]>([])
  const branches = ref<MobiBranch[]>([])

  const isLoadingCatalogs = ref(false)
  const isLoadingRepositories = ref(false)
  const isLoadingRecords = ref(false)
  const isLoadingBranches = ref(false)

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
   * Load catalogs from cache or fetch from server
   */
  async function loadCatalogs(
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
    if (!forceRefresh && isCacheValid(catalogCache, cacheKey)) {
      const cached = catalogCache.get(cacheKey)
      if (cached) {
        catalogs.value = cached.data
        error.value = null
        return
      }
    }

    // Fetch from server
    isLoadingCatalogs.value = true
    error.value = null

    try {
      const result = await window.electronAPI.mobi.listCatalogs(baseUrl, credentials, allowInsecure)

      // Update state
      catalogs.value = result

      // Update cache
      catalogCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      })

      error.value = null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load catalogs'
      error.value = message
      console.error('Failed to load catalogs:', err)
    } finally {
      isLoadingCatalogs.value = false
    }
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
    if (!forceRefresh && isCacheValid(repositoryCache, cacheKey)) {
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
      const result = await window.electronAPI.mobi.listRepositories(
        baseUrl,
        credentials,
        allowInsecure
      )

      // Update state
      repositories.value = result

      // Update cache
      repositoryCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      })

      error.value = null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load repositories'
      error.value = message
      console.error('Failed to load repositories:', err)
    } finally {
      isLoadingRepositories.value = false
    }
  }

  /**
   * Load records from cache or fetch from server
   */
  async function loadRecords(
    baseUrl: string,
    catalogId: string,
    recordTypes?: string[], // Record type IRIs
    credentials?: { username?: string; password?: string },
    forceRefresh: boolean = false,
    allowInsecure?: boolean
  ): Promise<void> {
    // Validate input
    if (!baseUrl || typeof baseUrl !== 'string') {
      error.value = 'Base URL is required'
      return
    }

    if (!catalogId || typeof catalogId !== 'string') {
      error.value = 'Catalog ID is required'
      return
    }

    // Include record types in cache key
    const cacheKey = `${baseUrl}:${catalogId}:${recordTypes?.join(',') || 'all'}`

    // Check cache first (unless force refresh)
    if (!forceRefresh && isCacheValid(recordCache, cacheKey)) {
      const cached = recordCache.get(cacheKey)
      if (cached) {
        records.value = cached.data
        error.value = null
        return
      }
    }

    // Fetch from server
    isLoadingRecords.value = true
    error.value = null

    try {
      const result = await window.electronAPI.mobi.listRecords(
        baseUrl,
        catalogId,
        recordTypes,
        credentials,
        allowInsecure
      )

      // Sort by title
      const sorted = [...result].sort((a, b) => a.title.localeCompare(b.title))

      // Update state
      records.value = sorted

      // Update cache
      recordCache.set(cacheKey, {
        data: sorted,
        timestamp: Date.now(),
      })

      error.value = null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load records'
      error.value = message
      console.error('Failed to load records:', err)
    } finally {
      isLoadingRecords.value = false
    }
  }

  /**
   * Load branches from cache or fetch from server
   */
  async function loadBranches(
    baseUrl: string,
    catalogId: string,
    recordId: string,
    credentials?: { username?: string; password?: string },
    forceRefresh: boolean = false,
    allowInsecure?: boolean
  ): Promise<void> {
    // Validate input
    if (!baseUrl || typeof baseUrl !== 'string') {
      error.value = 'Base URL is required'
      return
    }

    if (!catalogId || typeof catalogId !== 'string') {
      error.value = 'Catalog ID is required'
      return
    }

    if (!recordId || typeof recordId !== 'string') {
      error.value = 'Record ID is required'
      return
    }

    const cacheKey = `${baseUrl}:${catalogId}:${recordId}`

    // Check cache first (unless force refresh)
    if (!forceRefresh && isCacheValid(branchCache, cacheKey)) {
      const cached = branchCache.get(cacheKey)
      if (cached) {
        branches.value = cached.data
        error.value = null
        return
      }
    }

    // Fetch from server
    isLoadingBranches.value = true
    error.value = null

    try {
      const result = await window.electronAPI.mobi.listBranches(
        baseUrl,
        catalogId,
        recordId,
        credentials,
        allowInsecure
      )

      // Update state (already sorted by IPC handler: MASTER first)
      branches.value = result

      // Update cache
      branchCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      })

      error.value = null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load branches'
      error.value = message
      console.error('Failed to load branches:', err)
    } finally {
      isLoadingBranches.value = false
    }
  }

  /**
   * Authenticate with Mobi (validate credentials)
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
      await window.electronAPI.mobi.authenticate(baseUrl, username, password, allowInsecure)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      throw new Error(message)
    }
  }

  /**
   * Clear all cached data
   */
  function clearCache(): void {
    catalogCache.clear()
    repositoryCache.clear()
    recordCache.clear()
    branchCache.clear()
    catalogs.value = []
    repositories.value = []
    records.value = []
    branches.value = []
    error.value = null
  }

  /**
   * Check if any resources are loaded
   */
  const hasCatalogs = computed(() => catalogs.value.length > 0)
  const hasRepositories = computed(() => repositories.value.length > 0)
  const hasRecords = computed(() => records.value.length > 0)
  const hasBranches = computed(() => branches.value.length > 0)

  /**
   * Check if any operation is in progress
   */
  const isLoading = computed(
    () =>
      isLoadingCatalogs.value ||
      isLoadingRepositories.value ||
      isLoadingRecords.value ||
      isLoadingBranches.value
  )

  return {
    // State
    catalogs,
    repositories,
    records,
    branches,
    isLoadingCatalogs,
    isLoadingRepositories,
    isLoadingRecords,
    isLoadingBranches,
    isLoading,
    error,

    // Computed
    hasCatalogs,
    hasRepositories,
    hasRecords,
    hasBranches,

    // Methods
    loadCatalogs,
    loadRepositories,
    loadRecords,
    loadBranches,
    authenticate,
    clearCache,
  }
}
