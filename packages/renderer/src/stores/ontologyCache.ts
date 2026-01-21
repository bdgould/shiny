/**
 * Pinia store for ontology cache state management
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  OntologyCache,
  CacheLoadStatus,
  CacheProgress,
  CacheValidation,
  CacheSearchOptions,
  CacheSearchResult,
  AnyOntologyElement,
  OntologyElementType,
} from '../types/ontologyCache'

import { ontologyCacheService } from '../services/cache/ontologyCacheService'

/**
 * Store for managing ontology caches
 */
export const useOntologyCacheStore = defineStore('ontologyCache', () => {
  // State
  const caches = ref<Map<string, OntologyCache>>(new Map())
  const loadingStatus = ref<Map<string, CacheLoadStatus>>(new Map())
  const errors = ref<Map<string, string>>(new Map())
  const progressData = ref<Map<string, CacheProgress>>(new Map())

  // Getters
  const getCache = computed(() => {
    return (backendId: string): OntologyCache | null => {
      return caches.value.get(backendId) || null
    }
  })

  const getLoadingStatus = computed(() => {
    return (backendId: string): CacheLoadStatus => {
      return loadingStatus.value.get(backendId) || 'idle'
    }
  })

  const getError = computed(() => {
    return (backendId: string): string | null => {
      return errors.value.get(backendId) || null
    }
  })

  const getProgress = computed(() => {
    return (backendId: string): CacheProgress | null => {
      return progressData.value.get(backendId) || null
    }
  })

  const isLoading = computed(() => {
    return (backendId: string): boolean => {
      const status = loadingStatus.value.get(backendId)
      return status === 'loading' || status === 'refreshing'
    }
  })

  // Actions

  /**
   * Load cache for a backend (from IndexedDB or fetch from backend)
   */
  async function loadCache(
    backendId: string,
    force: boolean = false
  ): Promise<OntologyCache | null> {
    try {
      // Set loading status
      loadingStatus.value.set(backendId, 'loading')
      errors.value.delete(backendId)

      // Check if cache exists and is valid
      const validation = await ontologyCacheService.validateCache(backendId)

      if (!force && validation.exists && validation.valid) {
        // Load from IndexedDB
        const cache = await ontologyCacheService.getCache(backendId)
        if (cache) {
          caches.value.set(backendId, cache)
          loadingStatus.value.set(backendId, 'success')
          return cache
        }
      }

      // Cache doesn't exist or is invalid, fetch from backend
      return await refreshCache(backendId, false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.value.set(backendId, errorMessage)
      loadingStatus.value.set(backendId, 'error')
      console.error(`Failed to load cache for backend ${backendId}:`, error)
      return null
    }
  }

  /**
   * Refresh cache from backend
   */
  async function refreshCache(
    backendId: string,
    background: boolean = false
  ): Promise<OntologyCache | null> {
    try {
      // Set status
      loadingStatus.value.set(backendId, background ? 'refreshing' : 'loading')
      errors.value.delete(backendId)

      // Register progress listener
      const removeProgressListener = window.electronAPI.cache.onProgress(
        ({ backendId: id, progress }) => {
          if (id === backendId) {
            progressData.value.set(backendId, progress)
          }
        }
      )

      try {
        // Fetch from backend
        const cache = await window.electronAPI.cache.fetch(backendId, true)

        // Store in IndexedDB
        await ontologyCacheService.storeCache(backendId, cache)

        // Update in-memory cache
        caches.value.set(backendId, cache)
        loadingStatus.value.set(backendId, 'success')
        progressData.value.delete(backendId)

        return cache
      } finally {
        // Clean up progress listener
        removeProgressListener()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.value.set(backendId, errorMessage)
      loadingStatus.value.set(backendId, 'error')
      progressData.value.delete(backendId)
      console.error(`Failed to refresh cache for backend ${backendId}:`, error)
      return null
    }
  }

  /**
   * Smart refresh: serve stale cache while fetching fresh data
   */
  async function smartRefresh(backendId: string): Promise<OntologyCache | null> {
    try {
      // Check validation status
      const validation = await ontologyCacheService.validateCache(backendId)

      if (validation.stale) {
        // Cache is stale, serve it immediately
        const staleCache = await ontologyCacheService.getCache(backendId)
        if (staleCache) {
          caches.value.set(backendId, staleCache)
          loadingStatus.value.set(backendId, 'success')
        }

        // Fetch fresh data in background
        refreshCache(backendId, true)

        return staleCache
      } else if (validation.valid) {
        // Cache is still valid, just load it
        return await loadCache(backendId, false)
      } else {
        // No cache exists, fetch fresh
        return await refreshCache(backendId, false)
      }
    } catch (error) {
      console.error(`Smart refresh failed for backend ${backendId}:`, error)
      return await loadCache(backendId, false)
    }
  }

  /**
   * Invalidate cache for a backend
   */
  async function invalidateCache(backendId: string): Promise<void> {
    try {
      await ontologyCacheService.clearCache(backendId)
      caches.value.delete(backendId)
      loadingStatus.value.delete(backendId)
      errors.value.delete(backendId)
      progressData.value.delete(backendId)
    } catch (error) {
      console.error(`Failed to invalidate cache for backend ${backendId}:`, error)
      throw error
    }
  }

  /**
   * Search elements in cache
   */
  async function searchElements(
    backendId: string,
    options: CacheSearchOptions
  ): Promise<CacheSearchResult[]> {
    try {
      // Try in-memory cache first
      const cache = caches.value.get(backendId)
      if (cache) {
        // Search in-memory (we could implement in-memory search here)
        // For now, delegate to IndexedDB service
      }

      // Search in IndexedDB
      return await ontologyCacheService.searchElements(backendId, options)
    } catch (error) {
      console.error(`Failed to search elements for backend ${backendId}:`, error)
      return []
    }
  }

  /**
   * Get element by IRI
   */
  async function getElementByIri(
    backendId: string,
    iri: string,
    type?: OntologyElementType
  ): Promise<AnyOntologyElement | null> {
    try {
      // Try in-memory cache first
      const cache = caches.value.get(backendId)
      if (cache) {
        // Search in-memory
        if (!type || type === 'class') {
          const found = cache.classes.find((c) => c.iri === iri)
          if (found) return found
        }
        if (!type || type === 'property') {
          const found = cache.properties.find((p) => p.iri === iri)
          if (found) return found
        }
        if (!type || type === 'individual') {
          const found = cache.individuals.find((i) => i.iri === iri)
          if (found) return found
        }
      }

      // Fallback to IndexedDB
      return await ontologyCacheService.getElementByIri(backendId, iri, type)
    } catch (error) {
      console.error(`Failed to get element ${iri} for backend ${backendId}:`, error)
      return null
    }
  }

  /**
   * Validate cache
   */
  async function validateCache(backendId: string): Promise<CacheValidation> {
    return await ontologyCacheService.validateCache(backendId)
  }

  /**
   * Get cache statistics
   */
  async function getStats(backendId: string) {
    return await ontologyCacheService.getStats(backendId)
  }

  /**
   * Get all cached backend IDs
   */
  async function getAllCachedBackendIds(): Promise<string[]> {
    return await ontologyCacheService.getAllCachedBackendIds()
  }

  /**
   * Clear all caches
   */
  async function clearAllCaches(): Promise<void> {
    try {
      await ontologyCacheService.clearAllCaches()
      caches.value.clear()
      loadingStatus.value.clear()
      errors.value.clear()
      progressData.value.clear()
    } catch (error) {
      console.error('Failed to clear all caches:', error)
      throw error
    }
  }

  return {
    // State
    caches,
    loadingStatus,
    errors,
    progressData,
    // Getters
    getCache,
    getLoadingStatus,
    getError,
    getProgress,
    isLoading,
    // Actions
    loadCache,
    refreshCache,
    smartRefresh,
    invalidateCache,
    searchElements,
    getElementByIri,
    validateCache,
    getStats,
    getAllCachedBackendIds,
    clearAllCaches,
  }
})
