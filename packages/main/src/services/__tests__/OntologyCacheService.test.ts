import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OntologyCacheService } from '../OntologyCacheService'
import { DEFAULT_CACHE_CONFIG } from '../../backends/ontologyTypes'

// Create mock provider that will be set in beforeEach
const mockProvider = {
  execute: vi.fn(),
}

// Mock BackendFactory at the module level
vi.mock('../../backends/BackendFactory', () => ({
  BackendFactory: {
    getProvider: vi.fn(() => mockProvider),
  },
}))

describe('OntologyCacheService', () => {
  let cacheService: OntologyCacheService
  let mockBackendService: any

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Mock BackendService
    mockBackendService = {
      getBackend: vi.fn(),
      credentialService: {
        getCredentials: vi.fn(),
      },
    }

    cacheService = new OntologyCacheService(mockBackendService)
  })

  describe('fetchCache', () => {
    it('should fetch all ontology elements successfully', async () => {
      const mockBackend = {
        id: 'test-backend',
        name: 'Test Backend',
        type: 'sparql11',
        cacheConfig: { ...DEFAULT_CACHE_CONFIG, enabled: true },
      }

      const mockClassesResult = {
        data: {
          results: {
            bindings: [
              {
                iri: { value: 'http://example.org/Class1' },
                label: { value: 'Class 1' },
                description: { value: 'First class' },
              },
              {
                iri: { value: 'http://example.org/Class2' },
                label: { value: 'Class 2' },
              },
            ],
          },
        },
      }

      const mockPropertiesResult = {
        data: {
          results: {
            bindings: [
              {
                iri: { value: 'http://example.org/prop1' },
                label: { value: 'Property 1' },
                propertyType: { value: 'object' },
                domain: { value: 'http://example.org/Class1' },
                range: { value: 'http://example.org/Class2' },
              },
            ],
          },
        },
      }

      const mockIndividualsResult = {
        data: {
          results: {
            bindings: [
              {
                iri: { value: 'http://example.org/Individual1' },
                label: { value: 'Individual 1' },
                class: { value: 'http://example.org/Class1' },
              },
            ],
          },
        },
      }

      mockBackendService.getBackend.mockResolvedValue(mockBackend)
      mockBackendService.credentialService.getCredentials.mockResolvedValue(null)
      mockProvider.execute
        .mockResolvedValueOnce(mockClassesResult)
        .mockResolvedValueOnce(mockPropertiesResult)
        .mockResolvedValueOnce(mockIndividualsResult)

      const progressCallback = vi.fn()
      const result = await cacheService.fetchCache('test-backend', progressCallback)

      // Verify structure
      expect(result).toHaveProperty('metadata')
      expect(result).toHaveProperty('classes')
      expect(result).toHaveProperty('properties')
      expect(result).toHaveProperty('individuals')
      expect(result).toHaveProperty('namespaces')

      // Verify counts
      expect(result.classes).toHaveLength(2)
      expect(result.properties).toHaveLength(1)
      expect(result.individuals).toHaveLength(1)

      // Verify metadata
      expect(result.metadata.backendId).toBe('test-backend')
      expect(result.metadata.stats.classCount).toBe(2)
      expect(result.metadata.stats.propertyCount).toBe(1)
      expect(result.metadata.stats.individualCount).toBe(1)
      expect(result.metadata.stats.totalCount).toBe(4)

      // Verify progress callbacks
      expect(progressCallback).toHaveBeenCalled()
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      )
    })

    it('should throw error when backend not found', async () => {
      mockBackendService.getBackend.mockResolvedValue(null)

      await expect(cacheService.fetchCache('nonexistent')).rejects.toThrow(
        'Backend not found: nonexistent'
      )
    })

    it('should throw error when cache is disabled', async () => {
      const mockBackend = {
        id: 'test-backend',
        name: 'Test Backend',
        type: 'sparql11',
        cacheConfig: { ...DEFAULT_CACHE_CONFIG, enabled: false },
      }

      mockBackendService.getBackend.mockResolvedValue(mockBackend)

      await expect(cacheService.fetchCache('test-backend')).rejects.toThrow(
        'Cache is not enabled for backend: Test Backend'
      )
    })

    it('should enforce maxElements limit', async () => {
      const mockBackend = {
        id: 'test-backend',
        name: 'Test Backend',
        type: 'sparql11',
        cacheConfig: { ...DEFAULT_CACHE_CONFIG, enabled: true, maxElements: 2 },
      }

      // Return 3 classes, exceeding limit
      const mockClassesResult = {
        data: {
          results: {
            bindings: [
              { iri: { value: 'http://example.org/Class1' } },
              { iri: { value: 'http://example.org/Class2' } },
              { iri: { value: 'http://example.org/Class3' } },
            ],
          },
        },
      }

      mockBackendService.getBackend.mockResolvedValue(mockBackend)
      mockBackendService.credentialService.getCredentials.mockResolvedValue(null)
      mockProvider.execute.mockResolvedValueOnce(mockClassesResult)

      await expect(cacheService.fetchCache('test-backend')).rejects.toThrow(
        'Too many elements: 3 exceeds limit of 2'
      )
    })

    it('should handle SPARQL query errors', async () => {
      const mockBackend = {
        id: 'test-backend',
        name: 'Test Backend',
        type: 'sparql11',
        cacheConfig: { ...DEFAULT_CACHE_CONFIG, enabled: true },
      }

      mockBackendService.getBackend.mockResolvedValue(mockBackend)
      mockBackendService.credentialService.getCredentials.mockResolvedValue(null)
      mockProvider.execute.mockRejectedValue(new Error('Query failed'))

      const progressCallback = vi.fn()

      await expect(cacheService.fetchCache('test-backend', progressCallback)).rejects.toThrow()

      // Verify error progress callback
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.any(String),
        })
      )
    })

    it('should parse IRIs correctly', async () => {
      const mockBackend = {
        id: 'test-backend',
        name: 'Test Backend',
        type: 'sparql11',
        cacheConfig: { ...DEFAULT_CACHE_CONFIG, enabled: true },
      }

      const mockClassesResult = {
        data: {
          results: {
            bindings: [
              { iri: { value: 'http://example.org/ontology#MyClass' } },
              { iri: { value: 'http://example.org/ontology/MyClass2' } },
            ],
          },
        },
      }

      mockBackendService.getBackend.mockResolvedValue(mockBackend)
      mockBackendService.credentialService.getCredentials.mockResolvedValue(null)
      mockProvider.execute
        .mockResolvedValueOnce(mockClassesResult)
        .mockResolvedValueOnce({ data: { results: { bindings: [] } } })
        .mockResolvedValueOnce({ data: { results: { bindings: [] } } })

      const result = await cacheService.fetchCache('test-backend')

      expect(result.classes[0].namespace).toBe('http://example.org/ontology#')
      expect(result.classes[0].localName).toBe('MyClass')
      expect(result.classes[1].namespace).toBe('http://example.org/ontology/')
      expect(result.classes[1].localName).toBe('MyClass2')
    })

    it('should extract well-known namespaces', async () => {
      const mockBackend = {
        id: 'test-backend',
        name: 'Test Backend',
        type: 'sparql11',
        cacheConfig: { ...DEFAULT_CACHE_CONFIG, enabled: true },
      }

      const mockClassesResult = {
        data: {
          results: {
            bindings: [
              { iri: { value: 'http://www.w3.org/2002/07/owl#Class' } },
              { iri: { value: 'http://www.w3.org/2000/01/rdf-schema#Resource' } },
              { iri: { value: 'http://www.w3.org/2000/01/rdf-schema#Class' } },
            ],
          },
        },
      }

      mockBackendService.getBackend.mockResolvedValue(mockBackend)
      mockBackendService.credentialService.getCredentials.mockResolvedValue(null)
      mockProvider.execute
        .mockResolvedValueOnce(mockClassesResult)
        .mockResolvedValueOnce({ data: { results: { bindings: [] } } })
        .mockResolvedValueOnce({ data: { results: { bindings: [] } } })

      const result = await cacheService.fetchCache('test-backend')

      expect(result.namespaces).toHaveProperty('owl')
      expect(result.namespaces.owl).toBe('http://www.w3.org/2002/07/owl#')
      expect(result.namespaces).toHaveProperty('rdfs')
      expect(result.namespaces.rdfs).toBe('http://www.w3.org/2000/01/rdf-schema#')
    })
  })

  describe('testQuery', () => {
    it('should validate and test a SPARQL query', async () => {
      const mockBackend = {
        id: 'test-backend',
        name: 'Test Backend',
        type: 'sparql11',
      }

      const mockResult = {
        data: {
          results: {
            bindings: [{ iri: { value: 'http://example.org/Test' } }],
          },
        },
      }

      mockBackendService.getBackend.mockResolvedValue(mockBackend)
      mockBackendService.credentialService.getCredentials.mockResolvedValue(null)
      mockProvider.execute.mockResolvedValue(mockResult)

      const result = await cacheService.testQuery('test-backend', 'SELECT * WHERE { ?s ?p ?o }')

      expect(result.valid).toBe(true)
      expect(result.resultCount).toBe(1)
    })

    it('should return error for invalid query', async () => {
      const mockBackend = {
        id: 'test-backend',
        name: 'Test Backend',
        type: 'sparql11',
      }

      mockBackendService.getBackend.mockResolvedValue(mockBackend)
      mockBackendService.credentialService.getCredentials.mockResolvedValue(null)
      mockProvider.execute.mockRejectedValue(new Error('Syntax error'))

      const result = await cacheService.testQuery('test-backend', 'INVALID QUERY')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Syntax error')
    })

    it('should return error for nonexistent backend', async () => {
      mockBackendService.getBackend.mockResolvedValue(null)

      const result = await cacheService.testQuery('nonexistent', 'SELECT * WHERE { ?s ?p ?o }')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Backend not found')
    })
  })
})
