/**
 * IndexedDB service for ontology cache persistence
 * Handles storage, retrieval, and management of cached ontology elements
 */

import type {
  OntologyCache,
  OntologyClass,
  OntologyProperty,
  OntologyIndividual,
  AnyOntologyElement,
  CacheMetadata,
  CacheStats,
  OntologyElementType
} from '../../types/ontologyCache'

import {
  ONTOLOGY_CACHE_DB_NAME,
  ONTOLOGY_CACHE_DB_VERSION,
  CACHE_STORES,
  type CacheValidation,
  type CacheSearchOptions,
  type CacheSearchResult,
  type NamespaceEntry
} from '../../types/ontologyCache'

import { CACHE_SCHEMA_VERSION } from '../../../../main/src/backends/ontologyTypes'

/**
 * Service for managing ontology cache in IndexedDB
 */
class OntologyCacheService {
  private db: IDBDatabase | null = null
  private initPromise: Promise<IDBDatabase> | null = null

  /**
   * Initialize IndexedDB connection
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(ONTOLOGY_CACHE_DB_NAME, ONTOLOGY_CACHE_DB_VERSION)

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`))
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create metadata store (backendId as key)
        if (!db.objectStoreNames.contains(CACHE_STORES.METADATA)) {
          db.createObjectStore(CACHE_STORES.METADATA, { keyPath: 'backendId' })
        }

        // Create classes store with composite key (backendId + iri)
        if (!db.objectStoreNames.contains(CACHE_STORES.CLASSES)) {
          const classStore = db.createObjectStore(CACHE_STORES.CLASSES, {
            keyPath: ['backendId', 'iri']
          })
          classStore.createIndex('backendId', 'backendId', { unique: false })
          classStore.createIndex('label', 'label', { unique: false })
        }

        // Create properties store with composite key (backendId + iri)
        if (!db.objectStoreNames.contains(CACHE_STORES.PROPERTIES)) {
          const propStore = db.createObjectStore(CACHE_STORES.PROPERTIES, {
            keyPath: ['backendId', 'iri']
          })
          propStore.createIndex('backendId', 'backendId', { unique: false })
          propStore.createIndex('label', 'label', { unique: false })
        }

        // Create individuals store with composite key (backendId + iri)
        if (!db.objectStoreNames.contains(CACHE_STORES.INDIVIDUALS)) {
          const indStore = db.createObjectStore(CACHE_STORES.INDIVIDUALS, {
            keyPath: ['backendId', 'iri']
          })
          indStore.createIndex('backendId', 'backendId', { unique: false })
          indStore.createIndex('label', 'label', { unique: false })
        }

        // Create namespaces store with composite key (backendId + prefix)
        if (!db.objectStoreNames.contains(CACHE_STORES.NAMESPACES)) {
          const nsStore = db.createObjectStore(CACHE_STORES.NAMESPACES, {
            keyPath: ['backendId', 'prefix']
          })
          nsStore.createIndex('backendId', 'backendId', { unique: false })
        }
      }
    })

    return this.initPromise
  }

  /**
   * Store complete cache for a backend
   */
  async storeCache(backendId: string, cache: OntologyCache): Promise<void> {
    const db = await this.initDB()
    const transaction = db.transaction(
      [
        CACHE_STORES.METADATA,
        CACHE_STORES.CLASSES,
        CACHE_STORES.PROPERTIES,
        CACHE_STORES.INDIVIDUALS,
        CACHE_STORES.NAMESPACES
      ],
      'readwrite'
    )

    return new Promise((resolve, reject) => {
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()

      // Clear existing data for this backend
      this.clearCacheInTransaction(backendId, transaction)

      // Store metadata
      const metadataStore = transaction.objectStore(CACHE_STORES.METADATA)
      metadataStore.put(cache.metadata)

      // Store classes
      const classStore = transaction.objectStore(CACHE_STORES.CLASSES)
      cache.classes.forEach((cls) => {
        classStore.put({ ...cls, backendId })
      })

      // Store properties
      const propStore = transaction.objectStore(CACHE_STORES.PROPERTIES)
      cache.properties.forEach((prop) => {
        propStore.put({ ...prop, backendId })
      })

      // Store individuals
      const indStore = transaction.objectStore(CACHE_STORES.INDIVIDUALS)
      cache.individuals.forEach((ind) => {
        indStore.put({ ...ind, backendId })
      })

      // Store namespaces
      const nsStore = transaction.objectStore(CACHE_STORES.NAMESPACES)
      Object.entries(cache.namespaces).forEach(([prefix, uri]) => {
        nsStore.put({ backendId, prefix, uri })
      })
    })
  }

  /**
   * Clear cache for a backend within a transaction
   */
  private clearCacheInTransaction(backendId: string, transaction: IDBTransaction): void {
    const stores = [
      CACHE_STORES.METADATA,
      CACHE_STORES.CLASSES,
      CACHE_STORES.PROPERTIES,
      CACHE_STORES.INDIVIDUALS,
      CACHE_STORES.NAMESPACES
    ]

    stores.forEach((storeName) => {
      const store = transaction.objectStore(storeName)
      if (storeName === CACHE_STORES.METADATA) {
        store.delete(backendId)
      } else {
        const index = store.index('backendId')
        const range = IDBKeyRange.only(backendId)
        const request = index.openCursor(range)

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            cursor.delete()
            cursor.continue()
          }
        }
      }
    })
  }

  /**
   * Retrieve complete cache for a backend
   */
  async getCache(backendId: string): Promise<OntologyCache | null> {
    const db = await this.initDB()
    const transaction = db.transaction(
      [
        CACHE_STORES.METADATA,
        CACHE_STORES.CLASSES,
        CACHE_STORES.PROPERTIES,
        CACHE_STORES.INDIVIDUALS,
        CACHE_STORES.NAMESPACES
      ],
      'readonly'
    )

    return new Promise((resolve, reject) => {
      transaction.onerror = () => reject(transaction.error)

      // Get metadata
      const metadataStore = transaction.objectStore(CACHE_STORES.METADATA)
      const metadataRequest = metadataStore.get(backendId)

      metadataRequest.onsuccess = async () => {
        const metadata = metadataRequest.result as CacheMetadata | undefined

        if (!metadata) {
          resolve(null)
          return
        }

        try {
          // Get classes
          const classes = await this.getAllFromStore<OntologyClass>(
            transaction,
            CACHE_STORES.CLASSES,
            backendId
          )

          // Get properties
          const properties = await this.getAllFromStore<OntologyProperty>(
            transaction,
            CACHE_STORES.PROPERTIES,
            backendId
          )

          // Get individuals
          const individuals = await this.getAllFromStore<OntologyIndividual>(
            transaction,
            CACHE_STORES.INDIVIDUALS,
            backendId
          )

          // Get namespaces
          const namespaceEntries = await this.getAllFromStore<NamespaceEntry>(
            transaction,
            CACHE_STORES.NAMESPACES,
            backendId
          )

          const namespaces: Record<string, string> = {}
          namespaceEntries.forEach((entry) => {
            namespaces[entry.prefix] = entry.uri
          })

          resolve({
            metadata,
            classes,
            properties,
            individuals,
            namespaces
          })
        } catch (error) {
          reject(error)
        }
      }
    })
  }

  /**
   * Get all items from a store for a specific backend
   */
  private getAllFromStore<T>(
    transaction: IDBTransaction,
    storeName: string,
    backendId: string
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = transaction.objectStore(storeName)
      const index = store.index('backendId')
      const range = IDBKeyRange.only(backendId)
      const request = index.getAll(range)

      request.onsuccess = () => {
        const items = request.result.map((item: any) => {
          // Remove the backendId field we added for indexing
          const { backendId: _, ...rest } = item
          return rest as T
        })
        resolve(items)
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get cache metadata for a backend
   */
  async getMetadata(backendId: string): Promise<CacheMetadata | null> {
    const db = await this.initDB()
    const transaction = db.transaction([CACHE_STORES.METADATA], 'readonly')
    const store = transaction.objectStore(CACHE_STORES.METADATA)

    return new Promise((resolve, reject) => {
      const request = store.get(backendId)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Validate cache (check if it exists and is not expired)
   */
  async validateCache(backendId: string): Promise<CacheValidation> {
    const metadata = await this.getMetadata(backendId)

    if (!metadata) {
      return {
        exists: false,
        valid: false,
        stale: false
      }
    }

    const now = Date.now()
    const age = now - metadata.lastUpdated
    const expiresAt = metadata.lastUpdated + metadata.ttl
    const isExpired = now > expiresAt

    return {
      exists: true,
      valid: !isExpired,
      stale: isExpired,
      age,
      ttl: metadata.ttl,
      expiresAt
    }
  }

  /**
   * Clear cache for a backend
   */
  async clearCache(backendId: string): Promise<void> {
    const db = await this.initDB()
    const transaction = db.transaction(
      [
        CACHE_STORES.METADATA,
        CACHE_STORES.CLASSES,
        CACHE_STORES.PROPERTIES,
        CACHE_STORES.INDIVIDUALS,
        CACHE_STORES.NAMESPACES
      ],
      'readwrite'
    )

    return new Promise((resolve, reject) => {
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()

      this.clearCacheInTransaction(backendId, transaction)
    })
  }

  /**
   * Clear all caches
   */
  async clearAllCaches(): Promise<void> {
    const db = await this.initDB()
    const transaction = db.transaction(
      [
        CACHE_STORES.METADATA,
        CACHE_STORES.CLASSES,
        CACHE_STORES.PROPERTIES,
        CACHE_STORES.INDIVIDUALS,
        CACHE_STORES.NAMESPACES
      ],
      'readwrite'
    )

    return new Promise((resolve, reject) => {
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()

      const stores = [
        CACHE_STORES.METADATA,
        CACHE_STORES.CLASSES,
        CACHE_STORES.PROPERTIES,
        CACHE_STORES.INDIVIDUALS,
        CACHE_STORES.NAMESPACES
      ]

      stores.forEach((storeName) => {
        const store = transaction.objectStore(storeName)
        store.clear()
      })
    })
  }

  /**
   * Search cached elements
   */
  async searchElements(
    backendId: string,
    options: CacheSearchOptions
  ): Promise<CacheSearchResult[]> {
    const cache = await this.getCache(backendId)

    if (!cache) {
      return []
    }

    const { query, types, limit = 50, caseSensitive = false, prefixOnly = false } = options

    const searchQuery = caseSensitive ? query : query.toLowerCase()
    const results: CacheSearchResult[] = []

    // Helper to match string
    const matches = (str: string | undefined): boolean => {
      if (!str) return false
      const compareStr = caseSensitive ? str : str.toLowerCase()
      if (prefixOnly) {
        return compareStr.startsWith(searchQuery)
      }
      return compareStr.includes(searchQuery)
    }

    // Helper to calculate relevance score
    const calculateScore = (element: AnyOntologyElement): { score: number; field: any } => {
      let maxScore = 0
      let matchedField: any = 'iri'

      // Exact label match = highest score
      if (element.label && element.label.toLowerCase() === searchQuery) {
        maxScore = 1.0
        matchedField = 'label'
      }
      // Label starts with query = high score
      else if (element.label && element.label.toLowerCase().startsWith(searchQuery)) {
        maxScore = 0.9
        matchedField = 'label'
      }
      // Local name starts with query = medium-high score
      else if (element.localName && element.localName.toLowerCase().startsWith(searchQuery)) {
        maxScore = 0.7
        matchedField = 'localName'
      }
      // Label contains query = medium score
      else if (element.label && element.label.toLowerCase().includes(searchQuery)) {
        maxScore = 0.6
        matchedField = 'label'
      }
      // IRI contains query = low-medium score
      else if (element.iri.toLowerCase().includes(searchQuery)) {
        maxScore = 0.5
        matchedField = 'iri'
      }
      // Description contains query = low score
      else if (element.description && element.description.toLowerCase().includes(searchQuery)) {
        maxScore = 0.3
        matchedField = 'description'
      }

      return { score: maxScore, field: matchedField }
    }

    // Search classes
    if (!types || types.includes('class')) {
      cache.classes.forEach((cls) => {
        if (
          matches(cls.iri) ||
          matches(cls.label) ||
          matches(cls.description) ||
          matches(cls.localName)
        ) {
          const { score, field } = calculateScore(cls)
          results.push({ element: cls, score, matchedField: field })
        }
      })
    }

    // Search properties
    if (!types || types.includes('property')) {
      cache.properties.forEach((prop) => {
        if (
          matches(prop.iri) ||
          matches(prop.label) ||
          matches(prop.description) ||
          matches(prop.localName)
        ) {
          const { score, field } = calculateScore(prop)
          results.push({ element: prop, score, matchedField: field })
        }
      })
    }

    // Search individuals
    if (!types || types.includes('individual')) {
      cache.individuals.forEach((ind) => {
        if (
          matches(ind.iri) ||
          matches(ind.label) ||
          matches(ind.description) ||
          matches(ind.localName)
        ) {
          const { score, field } = calculateScore(ind)
          results.push({ element: ind, score, matchedField: field })
        }
      })
    }

    // Sort by score (descending) and limit
    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  /**
   * Get element by IRI
   */
  async getElementByIri(
    backendId: string,
    iri: string,
    type?: OntologyElementType
  ): Promise<AnyOntologyElement | null> {
    const db = await this.initDB()

    // Determine which stores to search
    const storeNames: string[] = []
    if (!type || type === 'class') storeNames.push(CACHE_STORES.CLASSES)
    if (!type || type === 'property') storeNames.push(CACHE_STORES.PROPERTIES)
    if (!type || type === 'individual') storeNames.push(CACHE_STORES.INDIVIDUALS)

    for (const storeName of storeNames) {
      const transaction = db.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)

      const result = await new Promise<any>((resolve, reject) => {
        const request = store.get([backendId, iri])
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      if (result) {
        const { backendId: _, ...element } = result
        return element as AnyOntologyElement
      }
    }

    return null
  }

  /**
   * Get cache statistics
   */
  async getStats(backendId: string): Promise<CacheStats | null> {
    const metadata = await this.getMetadata(backendId)
    return metadata?.stats || null
  }

  /**
   * Get all backend IDs that have caches
   */
  async getAllCachedBackendIds(): Promise<string[]> {
    const db = await this.initDB()
    const transaction = db.transaction([CACHE_STORES.METADATA], 'readonly')
    const store = transaction.objectStore(CACHE_STORES.METADATA)

    return new Promise((resolve, reject) => {
      const request = store.getAllKeys()
      request.onsuccess = () => resolve(request.result as string[])
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initPromise = null
    }
  }
}

// Export singleton instance
export const ontologyCacheService = new OntologyCacheService()
