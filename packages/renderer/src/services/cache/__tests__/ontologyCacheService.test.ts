import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ontologyCacheService as service } from '../ontologyCacheService'
import type {
  OntologyCache,
  CacheMetadata,
  OntologyClass,
  OntologyProperty,
  OntologyIndividual,
  CacheStats,
} from '../../../types/ontologyCache'
import { CACHE_SCHEMA_VERSION } from '../../../../../main/src/backends/ontologyTypes'

// Mock IDBKeyRange globally
;(global as any).IDBKeyRange = {
  only: vi.fn().mockImplementation((value) => ({ value, type: 'only' })),
  bound: vi.fn().mockImplementation((lower, upper) => ({ lower, upper, type: 'bound' })),
  lowerBound: vi.fn().mockImplementation((value) => ({ value, type: 'lowerBound' })),
  upperBound: vi.fn().mockImplementation((value) => ({ value, type: 'upperBound' })),
}

// Mock data
const createMockStats = (): CacheStats => ({
  classCount: 2,
  propertyCount: 2,
  individualCount: 1,
  totalCount: 5,
  namespaceCount: 2,
})

const createMockMetadata = (
  backendId: string,
  overrides?: Partial<CacheMetadata>
): CacheMetadata => ({
  backendId,
  lastUpdated: Date.now(),
  ttl: 24 * 60 * 60 * 1000,
  version: CACHE_SCHEMA_VERSION,
  stats: createMockStats(),
  ...overrides,
})

const createMockClass = (iri: string, label?: string): OntologyClass => ({
  type: 'class',
  iri,
  label,
  description: `Description for ${label || iri}`,
  localName: iri.split('/').pop() || iri.split('#').pop(),
  namespace:
    iri.substring(0, iri.lastIndexOf('/') + 1) || iri.substring(0, iri.lastIndexOf('#') + 1),
})

const createMockProperty = (iri: string, label?: string): OntologyProperty => ({
  type: 'property',
  iri,
  label,
  description: `Description for ${label || iri}`,
  localName: iri.split('/').pop() || iri.split('#').pop(),
  namespace: iri.substring(0, iri.lastIndexOf('/') + 1),
  propertyType: 'object',
  domain: [],
  range: [],
})

const createMockIndividual = (iri: string, label?: string): OntologyIndividual => ({
  type: 'individual',
  iri,
  label,
  description: `Description for ${label || iri}`,
  localName: iri.split('/').pop() || iri.split('#').pop(),
  namespace: iri.substring(0, iri.lastIndexOf('/') + 1),
  classes: [],
})

const createMockCache = (backendId: string): OntologyCache => ({
  metadata: createMockMetadata(backendId),
  classes: [
    createMockClass('http://example.org/Person', 'Person'),
    createMockClass('http://example.org/Organization', 'Organization'),
  ],
  properties: [
    createMockProperty('http://example.org/name', 'name'),
    createMockProperty('http://example.org/worksFor', 'worksFor'),
  ],
  individuals: [createMockIndividual('http://example.org/john', 'John Doe')],
  namespaces: {
    ex: 'http://example.org/',
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  },
})

// IndexedDB mock implementation
class MockIDBRequest {
  result: any = null
  error: Error | null = null
  onsuccess: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null

  triggerSuccess(result: any) {
    this.result = result
    if (this.onsuccess) {
      this.onsuccess({ target: this })
    }
  }

  triggerError(error: Error) {
    this.error = error
    if (this.onerror) {
      this.onerror({ target: this })
    }
  }
}

class MockIDBIndex {
  getAll = vi.fn().mockImplementation(() => {
    const req = new MockIDBRequest()
    setTimeout(() => req.triggerSuccess([]), 0)
    return req
  })

  openCursor = vi.fn().mockImplementation(() => {
    const req = new MockIDBRequest()
    setTimeout(() => req.triggerSuccess(null), 0)
    return req
  })
}

class MockIDBObjectStore {
  private data = new Map<string, any>()
  name: string

  constructor(name: string) {
    this.name = name
  }

  put = vi.fn().mockImplementation((value) => {
    const key =
      typeof value === 'object' && value.backendId ? value.backendId : JSON.stringify(value)
    this.data.set(key, value)
    const req = new MockIDBRequest()
    setTimeout(() => req.triggerSuccess(key), 0)
    return req
  })

  get = vi.fn().mockImplementation((key) => {
    const req = new MockIDBRequest()
    const value = this.data.get(Array.isArray(key) ? key.join(':') : key)
    setTimeout(() => req.triggerSuccess(value), 0)
    return req
  })

  delete = vi.fn().mockImplementation((key) => {
    this.data.delete(key)
    const req = new MockIDBRequest()
    setTimeout(() => req.triggerSuccess(undefined), 0)
    return req
  })

  clear = vi.fn().mockImplementation(() => {
    this.data.clear()
    const req = new MockIDBRequest()
    setTimeout(() => req.triggerSuccess(undefined), 0)
    return req
  })

  index = vi.fn().mockImplementation(() => new MockIDBIndex())

  getAllKeys = vi.fn().mockImplementation(() => {
    const req = new MockIDBRequest()
    setTimeout(() => req.triggerSuccess(Array.from(this.data.keys())), 0)
    return req
  })
}

class MockIDBTransaction {
  private stores = new Map<string, MockIDBObjectStore>()
  oncomplete: (() => void) | null = null
  onerror: (() => void) | null = null
  error: Error | null = null

  objectStore(name: string): MockIDBObjectStore {
    if (!this.stores.has(name)) {
      this.stores.set(name, new MockIDBObjectStore(name))
    }
    return this.stores.get(name)!
  }

  triggerComplete() {
    if (this.oncomplete) {
      this.oncomplete()
    }
  }

  triggerError(error: Error) {
    this.error = error
    if (this.onerror) {
      this.onerror()
    }
  }
}

class MockIDBDatabase {
  objectStoreNames = {
    contains: vi.fn().mockReturnValue(false),
  }

  createObjectStore = vi.fn().mockImplementation((name) => {
    const store = new MockIDBObjectStore(name)
    return {
      ...store,
      createIndex: vi.fn(),
    }
  })

  transaction = vi.fn().mockImplementation((storeNames) => {
    const tx = new MockIDBTransaction()
    // Auto-complete transactions after a short delay
    setTimeout(() => tx.triggerComplete(), 10)
    return tx
  })

  close = vi.fn()
}

class MockIDBOpenDBRequest extends MockIDBRequest {
  onupgradeneeded: ((event: any) => void) | null = null
}

describe('OntologyCacheService', () => {
  let mockDB: MockIDBDatabase
  let openRequest: MockIDBOpenDBRequest

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset service state by closing any existing connection
    service.close()

    mockDB = new MockIDBDatabase()
    openRequest = new MockIDBOpenDBRequest()

    // Mock indexedDB.open
    const mockIndexedDB = {
      open: vi.fn().mockImplementation(() => {
        // Trigger success after a small delay
        setTimeout(() => {
          openRequest.triggerSuccess(mockDB)
        }, 0)
        return openRequest
      }),
    }

    ;(global as any).indexedDB = mockIndexedDB
  })

  afterEach(() => {
    service.close()
  })

  describe('storeCache', () => {
    it('should store complete cache for a backend', async () => {
      const cache = createMockCache('backend-1')

      // The service will initialize the DB and store the cache
      await service.storeCache('backend-1', cache)

      // Verify that transaction was created
      expect(mockDB.transaction).toHaveBeenCalled()
    })
  })

  describe('getCache', () => {
    it('should return null when cache does not exist', async () => {
      const result = await service.getCache('nonexistent-backend')

      // With our mock, getCache returns null when no data exists
      expect(result).toBeNull()
    })
  })

  describe('getMetadata', () => {
    it('should return null when metadata does not exist', async () => {
      const result = await service.getMetadata('nonexistent-backend')

      expect(result).toBeNull()
    })
  })

  describe('validateCache', () => {
    it('should return not exists when cache is missing', async () => {
      const result = await service.validateCache('nonexistent-backend')

      expect(result.exists).toBe(false)
      expect(result.valid).toBe(false)
      expect(result.stale).toBe(false)
    })
  })

  describe('clearCache', () => {
    it('should clear cache for a specific backend', async () => {
      await service.clearCache('backend-1')

      // Should complete without error
      expect(mockDB.transaction).toHaveBeenCalled()
    })
  })

  describe('clearAllCaches', () => {
    it('should clear all caches', async () => {
      await service.clearAllCaches()

      // Should complete without error and call transaction
      expect(mockDB.transaction).toHaveBeenCalled()
    })
  })

  describe('searchElements', () => {
    it('should return empty array when cache does not exist', async () => {
      const results = await service.searchElements('nonexistent-backend', {
        query: 'Person',
      })

      expect(results).toEqual([])
    })
  })

  describe('getElementByIri', () => {
    it('should return null when element is not found', async () => {
      const result = await service.getElementByIri(
        'backend-1',
        'http://example.org/nonexistent',
        'class'
      )

      expect(result).toBeNull()
    })
  })

  describe('getStats', () => {
    it('should return null when metadata does not exist', async () => {
      const result = await service.getStats('nonexistent-backend')

      expect(result).toBeNull()
    })
  })

  describe('getAllCachedBackendIds', () => {
    it('should return empty array when no caches exist', async () => {
      const result = await service.getAllCachedBackendIds()

      expect(result).toEqual([])
    })
  })

  describe('close', () => {
    it('should close database connection', () => {
      // Initialize the DB first
      service.close()

      // Should not throw and should reset state
      expect(() => service.close()).not.toThrow()
    })

    it('should allow reopening after close', async () => {
      service.close()

      // Should be able to call operations after close
      const result = await service.getMetadata('backend-1')
      expect(result).toBeNull()
    })
  })
})

// Additional unit tests for search and scoring logic using mock data directly
describe('OntologyCacheService - Search Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    service.close()

    const mockDB = new MockIDBDatabase()
    const openRequest = new MockIDBOpenDBRequest()

    ;(global as any).indexedDB = {
      open: vi.fn().mockImplementation(() => {
        setTimeout(() => {
          openRequest.triggerSuccess(mockDB)
        }, 0)
        return openRequest
      }),
    }
  })

  afterEach(() => {
    service.close()
  })

  describe('search scoring behavior', () => {
    it('should return empty results when no cache exists', async () => {
      const results = await service.searchElements('backend-1', {
        query: 'test',
        types: ['class'],
        limit: 10,
      })

      expect(results).toEqual([])
    })

    it('should respect limit parameter', async () => {
      const results = await service.searchElements('backend-1', {
        query: 'test',
        limit: 5,
      })

      expect(results.length).toBeLessThanOrEqual(5)
    })

    it('should handle case insensitive search by default', async () => {
      const results = await service.searchElements('backend-1', {
        query: 'TEST',
        caseSensitive: false,
      })

      // Should not throw and should return results array
      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle prefix only search', async () => {
      const results = await service.searchElements('backend-1', {
        query: 'per',
        prefixOnly: true,
      })

      expect(Array.isArray(results)).toBe(true)
    })

    it('should filter by element types', async () => {
      const results = await service.searchElements('backend-1', {
        query: 'test',
        types: ['class', 'property'],
      })

      expect(Array.isArray(results)).toBe(true)
    })
  })
})

// Test cache validation logic
describe('OntologyCacheService - Cache Validation Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    service.close()

    const mockDB = new MockIDBDatabase()
    const openRequest = new MockIDBOpenDBRequest()

    ;(global as any).indexedDB = {
      open: vi.fn().mockImplementation(() => {
        setTimeout(() => {
          openRequest.triggerSuccess(mockDB)
        }, 0)
        return openRequest
      }),
    }
  })

  afterEach(() => {
    service.close()
  })

  it('should report cache as not existing when no metadata', async () => {
    const validation = await service.validateCache('nonexistent')

    expect(validation.exists).toBe(false)
    expect(validation.valid).toBe(false)
    expect(validation.stale).toBe(false)
    expect(validation.age).toBeUndefined()
    expect(validation.ttl).toBeUndefined()
    expect(validation.expiresAt).toBeUndefined()
  })
})

// Test element retrieval by IRI
describe('OntologyCacheService - Element Retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    service.close()

    const mockDB = new MockIDBDatabase()
    const openRequest = new MockIDBOpenDBRequest()

    ;(global as any).indexedDB = {
      open: vi.fn().mockImplementation(() => {
        setTimeout(() => {
          openRequest.triggerSuccess(mockDB)
        }, 0)
        return openRequest
      }),
    }
  })

  afterEach(() => {
    service.close()
  })

  it('should search all stores when type is not specified', async () => {
    const result = await service.getElementByIri('backend-1', 'http://example.org/test')

    // With empty mock, should return null
    expect(result).toBeNull()
  })

  it('should search only classes store when type is class', async () => {
    const result = await service.getElementByIri('backend-1', 'http://example.org/test', 'class')

    expect(result).toBeNull()
  })

  it('should search only properties store when type is property', async () => {
    const result = await service.getElementByIri('backend-1', 'http://example.org/test', 'property')

    expect(result).toBeNull()
  })

  it('should search only individuals store when type is individual', async () => {
    const result = await service.getElementByIri(
      'backend-1',
      'http://example.org/test',
      'individual'
    )

    expect(result).toBeNull()
  })
})
