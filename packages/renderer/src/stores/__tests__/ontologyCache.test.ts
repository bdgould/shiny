import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOntologyCacheStore } from '../ontologyCache'
import type { OntologyCache, CacheProgress } from '../../types/ontologyCache'

// Mock the ontologyCacheService module at module level
// The factory function is hoisted, so we define the mock inline
vi.mock('../../services/cache/ontologyCacheService', () => ({
  ontologyCacheService: {
    storeCache: vi.fn(),
    getCache: vi.fn(),
    validateCache: vi.fn(),
    getStats: vi.fn(),
    clearCache: vi.fn(),
    searchElements: vi.fn(),
    getAllCachedBackendIds: vi.fn(),
    getElementByIri: vi.fn(),
  },
}))

// Import the mocked service to get access to it in tests
import { ontologyCacheService as mockOntologyCacheService } from '../../services/cache/ontologyCacheService'

describe('useOntologyCacheStore', () => {
  let mockElectronAPI: any

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // Mock electron API
    mockElectronAPI = {
      cache: {
        fetch: vi.fn(),
        testQuery: vi.fn(),
        onProgress: vi.fn(() => () => {}),
      },
    }

    // Setup globals
    ;(global as any).window = {
      electronAPI: mockElectronAPI,
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should have empty caches map', () => {
      const store = useOntologyCacheStore()
      expect(store.caches.size).toBe(0)
    })

    it('should have empty progress map', () => {
      const store = useOntologyCacheStore()
      expect(store.progressData.size).toBe(0)
    })

    it('should not be loading', () => {
      const store = useOntologyCacheStore()
      expect(store.isLoading('backend-1')).toBe(false)
    })
  })

  describe('refreshCache', () => {
    it('should fetch and store cache successfully', async () => {
      const mockCache: OntologyCache = {
        metadata: {
          backendId: 'backend-1',
          lastUpdated: Date.now(),
          ttl: 86400000,
          version: 1,
          stats: {
            classCount: 2,
            propertyCount: 1,
            individualCount: 1,
            totalCount: 4,
            namespaceCount: 1,
          },
        },
        classes: [
          {
            type: 'class',
            iri: 'http://example.org/Class1',
            label: 'Class 1',
            namespace: 'http://example.org/',
            localName: 'Class1',
          },
        ],
        properties: [
          {
            type: 'property',
            iri: 'http://example.org/prop1',
            propertyType: 'object',
            domain: [],
            range: [],
            namespace: 'http://example.org/',
            localName: 'prop1',
          },
        ],
        individuals: [],
        namespaces: { ex: 'http://example.org/' },
      }

      mockElectronAPI.cache.fetch.mockResolvedValue(mockCache)
      vi.mocked(mockOntologyCacheService.storeCache).mockResolvedValue(undefined)

      const store = useOntologyCacheStore()
      const result = await store.refreshCache('backend-1')

      expect(result).toEqual(mockCache)
      expect(store.caches.get('backend-1')).toEqual(mockCache)
      expect(mockOntologyCacheService.storeCache).toHaveBeenCalledWith('backend-1', mockCache)
    })

    it('should track loading state', async () => {
      let resolveFetch: any
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve
      })

      mockElectronAPI.cache.fetch.mockReturnValue(fetchPromise)

      const store = useOntologyCacheStore()
      const refreshPromise = store.refreshCache('backend-1')

      expect(store.isLoading('backend-1')).toBe(true)

      const mockCache: OntologyCache = {
        metadata: {
          backendId: 'backend-1',
          lastUpdated: Date.now(),
          ttl: 86400000,
          version: 1,
          stats: { classCount: 0, propertyCount: 0, individualCount: 0, totalCount: 0, namespaceCount: 0 },
        },
        classes: [],
        properties: [],
        individuals: [],
        namespaces: {},
      }

      resolveFetch(mockCache)
      await refreshPromise

      expect(store.isLoading('backend-1')).toBe(false)
    })

    it('should handle fetch errors', async () => {
      mockElectronAPI.cache.fetch.mockRejectedValue(new Error('Fetch failed'))

      const store = useOntologyCacheStore()

      const result = await store.refreshCache('backend-1')

      expect(result).toBeNull()
      expect(store.getLoadingStatus('backend-1')).toBe('error')
      expect(store.getError('backend-1')).toBe('Fetch failed')
    })

    it('should not fetch in background mode', async () => {
      const mockCache: OntologyCache = {
        metadata: {
          backendId: 'backend-1',
          lastUpdated: Date.now(),
          ttl: 86400000,
          version: 1,
          stats: { classCount: 0, propertyCount: 0, individualCount: 0, totalCount: 0, namespaceCount: 0 },
        },
        classes: [],
        properties: [],
        individuals: [],
        namespaces: {},
      }

      mockElectronAPI.cache.fetch.mockResolvedValue(mockCache)
      vi.mocked(mockOntologyCacheService.storeCache).mockResolvedValue(undefined)

      const store = useOntologyCacheStore()
      await store.refreshCache('backend-1', true)

      expect(mockElectronAPI.cache.fetch).toHaveBeenCalledWith('backend-1', true)
    })
  })

  describe('loadCache', () => {
    it('should return cache from memory if valid', async () => {
      const mockCache: OntologyCache = {
        metadata: {
          backendId: 'backend-1',
          lastUpdated: Date.now(),
          ttl: 86400000,
          version: 1,
          stats: { classCount: 0, propertyCount: 0, individualCount: 0, totalCount: 0, namespaceCount: 0 },
        },
        classes: [],
        properties: [],
        individuals: [],
        namespaces: {},
      }

      vi.mocked(mockOntologyCacheService.validateCache).mockResolvedValue({
        exists: true,
        valid: true,
        stale: false,
        age: 1000,
        ttl: 86400000,
      })
      vi.mocked(mockOntologyCacheService.getCache).mockResolvedValue(mockCache)

      const store = useOntologyCacheStore()
      const result = await store.loadCache('backend-1')

      expect(result).toEqual(mockCache)
      expect(store.caches.get('backend-1')).toEqual(mockCache)
      expect(mockOntologyCacheService.getCache).toHaveBeenCalledWith('backend-1')
    })

    it('should load cache from IndexedDB if not in memory', async () => {
      const mockCache: OntologyCache = {
        metadata: {
          backendId: 'backend-1',
          lastUpdated: Date.now(),
          ttl: 86400000,
          version: 1,
          stats: { classCount: 0, propertyCount: 0, individualCount: 0, totalCount: 0, namespaceCount: 0 },
        },
        classes: [],
        properties: [],
        individuals: [],
        namespaces: {},
      }

      vi.mocked(mockOntologyCacheService.validateCache).mockResolvedValue({
        exists: true,
        valid: true,
        stale: false,
        age: 1000,
        ttl: 86400000,
      })
      vi.mocked(mockOntologyCacheService.getCache).mockResolvedValue(mockCache)

      const store = useOntologyCacheStore()
      const result = await store.loadCache('backend-1')

      expect(result).toEqual(mockCache)
      expect(store.caches.get('backend-1')).toEqual(mockCache)
      expect(mockOntologyCacheService.getCache).toHaveBeenCalledWith('backend-1')
    })

    it('should return null if cache does not exist', async () => {
      vi.mocked(mockOntologyCacheService.validateCache).mockResolvedValue({
        exists: false,
        valid: false,
        stale: false,
      })
      mockElectronAPI.cache.fetch.mockRejectedValue(new Error('Backend not found'))

      const store = useOntologyCacheStore()
      const result = await store.loadCache('backend-1')

      expect(result).toBeNull()
    })
  })

  describe('validateCache', () => {
    it('should validate fresh cache', async () => {
      const now = Date.now()
      const validation = {
        exists: true,
        valid: true,
        stale: false,
        age: 1000,
        ttl: 86400000,
        expiresAt: now + 86400000,
      }

      mockOntologyCacheService.validateCache.mockResolvedValue(validation)

      const store = useOntologyCacheStore()
      const result = await store.validateCache('backend-1')

      expect(result).toEqual(validation)
      expect(result.valid).toBe(true)
      expect(result.stale).toBe(false)
    })

    it('should validate stale cache', async () => {
      const validation = {
        exists: true,
        valid: false,
        stale: true,
        age: 90000000,
        ttl: 86400000,
      }

      mockOntologyCacheService.validateCache.mockResolvedValue(validation)

      const store = useOntologyCacheStore()
      const result = await store.validateCache('backend-1')

      expect(result.stale).toBe(true)
      expect(result.valid).toBe(false)
    })

    it('should validate nonexistent cache', async () => {
      const validation = {
        exists: false,
        valid: false,
        stale: false,
      }

      mockOntologyCacheService.validateCache.mockResolvedValue(validation)

      const store = useOntologyCacheStore()
      const result = await store.validateCache('backend-1')

      expect(result.exists).toBe(false)
      expect(result.valid).toBe(false)
    })
  })

  describe('invalidateCache', () => {
    it('should remove cache from memory and IndexedDB', async () => {
      const mockCache: OntologyCache = {
        metadata: {
          backendId: 'backend-1',
          lastUpdated: Date.now(),
          ttl: 86400000,
          version: 1,
          stats: { classCount: 0, propertyCount: 0, individualCount: 0, totalCount: 0, namespaceCount: 0 },
        },
        classes: [],
        properties: [],
        individuals: [],
        namespaces: {},
      }

      vi.mocked(mockOntologyCacheService.clearCache).mockResolvedValue(undefined)

      const store = useOntologyCacheStore()
      store.caches.set('backend-1', mockCache)

      await store.invalidateCache('backend-1')

      expect(store.caches.has('backend-1')).toBe(false)
      expect(mockOntologyCacheService.clearCache).toHaveBeenCalledWith('backend-1')
    })
  })

  describe('searchElements', () => {
    it('should search cached elements', async () => {
      const mockResults = [
        {
          element: {
            type: 'class' as const,
            iri: 'http://example.org/Person',
            label: 'Person',
            namespace: 'http://example.org/',
            localName: 'Person',
          },
          score: 1.0,
          matchedField: 'label' as const,
        },
      ]

      mockOntologyCacheService.searchElements.mockResolvedValue(mockResults)

      const store = useOntologyCacheStore()
      const results = await store.searchElements('backend-1', {
        query: 'Person',
        types: ['class'],
        limit: 10,
      })

      expect(results).toEqual(mockResults)
      expect(mockOntologyCacheService.searchElements).toHaveBeenCalledWith('backend-1', {
        query: 'Person',
        types: ['class'],
        limit: 10,
      })
    })

    it('should handle search errors', async () => {
      vi.mocked(mockOntologyCacheService.searchElements).mockRejectedValue(new Error('Search failed'))

      const store = useOntologyCacheStore()

      const results = await store.searchElements('backend-1', { query: 'test' })

      // Store catches errors and returns empty array
      expect(results).toEqual([])
    })
  })

  describe('getStats', () => {
    it('should return stats from cache metadata', async () => {
      const stats = {
        classCount: 10,
        propertyCount: 5,
        individualCount: 3,
        totalCount: 18,
        namespaceCount: 2,
      }

      mockOntologyCacheService.getStats.mockResolvedValue(stats)

      const store = useOntologyCacheStore()
      const result = await store.getStats('backend-1')

      expect(result).toEqual(stats)
    })

    it('should return null if cache does not exist', async () => {
      mockOntologyCacheService.getStats.mockResolvedValue(null)

      const store = useOntologyCacheStore()
      const result = await store.getStats('backend-1')

      expect(result).toBeNull()
    })
  })

  describe('smartRefresh', () => {
    it('should return existing cache if valid', async () => {
      const mockCache: OntologyCache = {
        metadata: {
          backendId: 'backend-1',
          lastUpdated: Date.now(),
          ttl: 86400000,
          version: 1,
          stats: { classCount: 0, propertyCount: 0, individualCount: 0, totalCount: 0, namespaceCount: 0 },
        },
        classes: [],
        properties: [],
        individuals: [],
        namespaces: {},
      }

      mockOntologyCacheService.validateCache.mockResolvedValue({
        exists: true,
        valid: true,
        stale: false,
      })
      mockOntologyCacheService.getCache.mockResolvedValue(mockCache)

      const store = useOntologyCacheStore()
      const result = await store.smartRefresh('backend-1')

      expect(result).toEqual(mockCache)
      expect(mockElectronAPI.cache.fetch).not.toHaveBeenCalled()
    })

    it('should serve stale cache while refreshing in background', async () => {
      const mockStaleCache: OntologyCache = {
        metadata: {
          backendId: 'backend-1',
          lastUpdated: Date.now() - 90000000,
          ttl: 86400000,
          version: 1,
          stats: { classCount: 1, propertyCount: 0, individualCount: 0, totalCount: 1, namespaceCount: 0 },
        },
        classes: [
          {
            type: 'class',
            iri: 'http://example.org/OldClass',
            namespace: 'http://example.org/',
            localName: 'OldClass',
          },
        ],
        properties: [],
        individuals: [],
        namespaces: {},
      }

      mockOntologyCacheService.validateCache.mockResolvedValue({
        exists: true,
        valid: false,
        stale: true,
      })
      mockOntologyCacheService.getCache.mockResolvedValue(mockStaleCache)
      mockElectronAPI.cache.fetch.mockResolvedValue(mockStaleCache)

      const store = useOntologyCacheStore()
      const result = await store.smartRefresh('backend-1')

      // Should return stale cache immediately
      expect(result).toEqual(mockStaleCache)

      // Should trigger background refresh
      expect(mockElectronAPI.cache.fetch).toHaveBeenCalledWith('backend-1', true)
    })

    it('should fetch new cache if does not exist', async () => {
      const mockNewCache: OntologyCache = {
        metadata: {
          backendId: 'backend-1',
          lastUpdated: Date.now(),
          ttl: 86400000,
          version: 1,
          stats: { classCount: 0, propertyCount: 0, individualCount: 0, totalCount: 0, namespaceCount: 0 },
        },
        classes: [],
        properties: [],
        individuals: [],
        namespaces: {},
      }

      vi.mocked(mockOntologyCacheService.validateCache).mockResolvedValue({
        exists: false,
        valid: false,
        stale: false,
      })
      mockElectronAPI.cache.fetch.mockResolvedValue(mockNewCache)
      vi.mocked(mockOntologyCacheService.storeCache).mockResolvedValue(undefined)

      const store = useOntologyCacheStore()
      const result = await store.smartRefresh('backend-1')

      expect(result).toEqual(mockNewCache)
      expect(mockElectronAPI.cache.fetch).toHaveBeenCalledWith('backend-1', true)
    })
  })

  describe('getAllCachedBackendIds', () => {
    it('should return all backend IDs with cached data', async () => {
      const backendIds = ['backend-1', 'backend-2', 'backend-3']
      mockOntologyCacheService.getAllCachedBackendIds.mockResolvedValue(backendIds)

      const store = useOntologyCacheStore()
      const result = await store.getAllCachedBackendIds()

      expect(result).toEqual(backendIds)
    })

    it('should return empty array if no caches exist', async () => {
      mockOntologyCacheService.getAllCachedBackendIds.mockResolvedValue([])

      const store = useOntologyCacheStore()
      const result = await store.getAllCachedBackendIds()

      expect(result).toEqual([])
    })
  })
})
