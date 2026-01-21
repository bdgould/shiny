/**
 * Ontology cache fetching service
 * Executes SPARQL queries to fetch ontology elements from backends
 */

import type {
  OntologyCache,
  OntologyClass,
  OntologyProperty,
  OntologyIndividual,
  CacheConfig,
  CacheProgress,
  CacheStats,
  CacheMetadata,
  PropertyType,
} from '../backends/ontologyTypes.js'

import { CACHE_SCHEMA_VERSION, DEFAULT_CACHE_CONFIG } from '../backends/ontologyTypes.js'
import { BackendService } from './BackendService.js'
import { BackendFactory } from '../backends/BackendFactory.js'

/**
 * SPARQL result binding value
 */
interface BindingValue {
  type: 'uri' | 'literal' | 'bnode'
  value: string
  'xml:lang'?: string
  datatype?: string
}

/**
 * SPARQL result row
 */
interface SparqlResultRow {
  [variable: string]: BindingValue
}

/**
 * Progress callback type
 */
type ProgressCallback = (progress: CacheProgress) => void

export class OntologyCacheService {
  private backendService: BackendService

  constructor(backendService: BackendService) {
    this.backendService = backendService
  }

  /**
   * Fetch complete ontology cache from a backend
   */
  async fetchCache(backendId: string, progressCallback?: ProgressCallback): Promise<OntologyCache> {
    // Get backend config
    const backend = await this.backendService.getBackend(backendId)
    if (!backend) {
      throw new Error(`Backend not found: ${backendId}`)
    }

    // Get cache config (use defaults if not configured)
    const cacheConfig = backend.cacheConfig || DEFAULT_CACHE_CONFIG

    if (!cacheConfig.enabled) {
      throw new Error(`Cache is not enabled for backend: ${backend.name}`)
    }

    // Get credentials
    const credentials = await this.backendService['credentialService'].getCredentials(backendId)

    // Get provider
    const provider = BackendFactory.getProvider(backend.type)

    let fetchedCount = 0

    // Helper to emit progress
    const emitProgress = (
      status: CacheProgress['status'],
      currentType?: CacheProgress['currentType'],
      error?: string
    ) => {
      if (progressCallback) {
        progressCallback({
          status,
          currentType,
          fetchedCount,
          error,
        })
      }
    }

    try {
      emitProgress('loading')

      // Fetch classes
      emitProgress('loading', 'class')
      const classes = await this.fetchClasses(
        provider,
        backend,
        credentials || undefined,
        cacheConfig
      )
      fetchedCount += classes.length
      emitProgress('loading', 'class')

      // Check max elements limit
      if (fetchedCount > cacheConfig.maxElements) {
        throw new Error(
          `Too many elements: ${fetchedCount} exceeds limit of ${cacheConfig.maxElements}`
        )
      }

      // Fetch properties
      emitProgress('loading', 'property')
      const properties = await this.fetchProperties(
        provider,
        backend,
        credentials || undefined,
        cacheConfig
      )
      fetchedCount += properties.length
      emitProgress('loading', 'property')

      // Check max elements limit
      if (fetchedCount > cacheConfig.maxElements) {
        throw new Error(
          `Too many elements: ${fetchedCount} exceeds limit of ${cacheConfig.maxElements}`
        )
      }

      // Fetch individuals
      emitProgress('loading', 'individual')
      const individuals = await this.fetchIndividuals(
        provider,
        backend,
        credentials || undefined,
        cacheConfig
      )
      fetchedCount += individuals.length
      emitProgress('loading', 'individual')

      // Check max elements limit
      if (fetchedCount > cacheConfig.maxElements) {
        throw new Error(
          `Too many elements: ${fetchedCount} exceeds limit of ${cacheConfig.maxElements}`
        )
      }

      // Extract namespaces from IRIs
      const namespaces = this.extractNamespaces([...classes, ...properties, ...individuals])

      // Calculate stats
      const stats: CacheStats = {
        classCount: classes.length,
        propertyCount: properties.length,
        individualCount: individuals.length,
        totalCount: fetchedCount,
        namespaceCount: Object.keys(namespaces).length,
      }

      // Create metadata
      const metadata: CacheMetadata = {
        backendId,
        lastUpdated: Date.now(),
        ttl: cacheConfig.ttl,
        version: CACHE_SCHEMA_VERSION,
        stats,
      }

      emitProgress('success')

      return {
        metadata,
        classes,
        properties,
        individuals,
        namespaces,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      emitProgress('error', undefined, errorMessage)
      throw error
    }
  }

  /**
   * Fetch OWL classes from backend
   */
  private async fetchClasses(
    provider: any,
    backend: any,
    credentials: any,
    cacheConfig: CacheConfig
  ): Promise<OntologyClass[]> {
    const query = cacheConfig.queries.classes

    try {
      const result = await provider.execute(backend, query, credentials)

      // result.data should contain SPARQL JSON results
      const bindings = (result.data as any)?.results?.bindings || []
      const classMap = new Map<string, OntologyClass>()

      bindings.forEach((row: SparqlResultRow) => {
        if (!row.iri) return

        const iri = row.iri.value
        const existing = classMap.get(iri)

        if (!existing) {
          const { namespace, localName } = this.parseIRI(iri)
          classMap.set(iri, {
            type: 'class',
            iri,
            label: row.label?.value,
            description: row.description?.value,
            namespace,
            localName,
          })
        }
      })

      return Array.from(classMap.values())
    } catch (error) {
      console.error('Failed to fetch classes:', error)
      throw new Error(
        `Failed to fetch classes: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Fetch OWL properties from backend
   */
  private async fetchProperties(
    provider: any,
    backend: any,
    credentials: any,
    cacheConfig: CacheConfig
  ): Promise<OntologyProperty[]> {
    const query = cacheConfig.queries.properties

    try {
      const result = await provider.execute(backend, query, credentials)

      // result.data should contain SPARQL JSON results
      const bindings = (result.data as any)?.results?.bindings || []
      const propertyMap = new Map<string, OntologyProperty>()

      bindings.forEach((row: SparqlResultRow) => {
        if (!row.iri) return

        const iri = row.iri.value
        const propertyType = (row.propertyType?.value || 'object') as PropertyType

        let property = propertyMap.get(iri)

        if (!property) {
          const { namespace, localName } = this.parseIRI(iri)
          property = {
            type: 'property',
            iri,
            propertyType,
            label: row.label?.value,
            description: row.description?.value,
            namespace,
            localName,
            domain: [],
            range: [],
          }
          propertyMap.set(iri, property)
        }

        // Add domain and range (can have multiple values)
        if (row.domain && !property.domain.includes(row.domain.value)) {
          property.domain.push(row.domain.value)
        }
        if (row.range && !property.range.includes(row.range.value)) {
          property.range.push(row.range.value)
        }
      })

      return Array.from(propertyMap.values())
    } catch (error) {
      console.error('Failed to fetch properties:', error)
      throw new Error(
        `Failed to fetch properties: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Fetch OWL named individuals from backend
   */
  private async fetchIndividuals(
    provider: any,
    backend: any,
    credentials: any,
    cacheConfig: CacheConfig
  ): Promise<OntologyIndividual[]> {
    const query = cacheConfig.queries.individuals

    try {
      const result = await provider.execute(backend, query, credentials)

      // result.data should contain SPARQL JSON results
      const bindings = (result.data as any)?.results?.bindings || []
      const individualMap = new Map<string, OntologyIndividual>()

      bindings.forEach((row: SparqlResultRow) => {
        if (!row.iri) return

        const iri = row.iri.value

        let individual = individualMap.get(iri)

        if (!individual) {
          const { namespace, localName } = this.parseIRI(iri)
          individual = {
            type: 'individual',
            iri,
            label: row.label?.value,
            description: row.description?.value,
            namespace,
            localName,
            classes: [],
          }
          individualMap.set(iri, individual)
        }

        // Add class (can have multiple values)
        if (row.class && !individual.classes.includes(row.class.value)) {
          individual.classes.push(row.class.value)
        }
      })

      return Array.from(individualMap.values())
    } catch (error) {
      console.error('Failed to fetch individuals:', error)
      throw new Error(
        `Failed to fetch individuals: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Parse IRI into namespace and local name
   */
  private parseIRI(iri: string): { namespace?: string; localName?: string } {
    // Try to split on # first (most common in OWL)
    const hashIndex = iri.lastIndexOf('#')
    if (hashIndex > 0 && hashIndex < iri.length - 1) {
      return {
        namespace: iri.substring(0, hashIndex + 1),
        localName: iri.substring(hashIndex + 1),
      }
    }

    // Try to split on last / (common in URLs)
    const slashIndex = iri.lastIndexOf('/')
    if (slashIndex > 0 && slashIndex < iri.length - 1) {
      return {
        namespace: iri.substring(0, slashIndex + 1),
        localName: iri.substring(slashIndex + 1),
      }
    }

    // Can't parse, return as-is
    return {
      namespace: undefined,
      localName: iri,
    }
  }

  /**
   * Extract common namespaces from a collection of elements
   */
  private extractNamespaces(
    elements: Array<{ iri: string; namespace?: string }>
  ): Record<string, string> {
    const namespaceMap = new Map<string, number>() // namespace -> count

    elements.forEach((element) => {
      if (element.namespace) {
        namespaceMap.set(element.namespace, (namespaceMap.get(element.namespace) || 0) + 1)
      }
    })

    // Only include namespaces used by at least 2 elements
    const result: Record<string, string> = {}
    let prefixCounter = 1

    namespaceMap.forEach((count, namespace) => {
      if (count >= 2) {
        // Generate a prefix (ns1, ns2, etc.) - this is basic, could be improved
        const prefix = `ns${prefixCounter++}`
        result[prefix] = namespace
      }
    })

    // Add common well-known namespaces if not already present
    const wellKnownNamespaces = {
      rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      owl: 'http://www.w3.org/2002/07/owl#',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
      dc: 'http://purl.org/dc/elements/1.1/',
      dcterms: 'http://purl.org/dc/terms/',
      skos: 'http://www.w3.org/2004/02/skos/core#',
      foaf: 'http://xmlns.com/foaf/0.1/',
    }

    // Check if any well-known namespace is used and add it with its standard prefix
    Object.entries(wellKnownNamespaces).forEach(([prefix, uri]) => {
      // Check if this URI is in the namespace map
      if (namespaceMap.has(uri)) {
        // Replace the generated prefix with the well-known one
        const existingPrefix = Object.keys(result).find((k) => result[k] === uri)
        if (existingPrefix) {
          delete result[existingPrefix]
        }
        result[prefix] = uri
      }
    })

    return result
  }

  /**
   * Test a custom SPARQL query (for UI validation)
   */
  async testQuery(
    backendId: string,
    query: string
  ): Promise<{ valid: boolean; error?: string; resultCount?: number }> {
    try {
      // Get backend config
      const backend = await this.backendService.getBackend(backendId)
      if (!backend) {
        return { valid: false, error: 'Backend not found' }
      }

      // Get credentials
      const credentials = await this.backendService['credentialService'].getCredentials(backendId)

      // Get provider
      const provider = BackendFactory.getProvider(backend.type)

      // Execute query
      const result = await provider.execute(backend, query, credentials || undefined)

      // If we get here, query succeeded (errors are thrown)
      const resultCount = (result.data as any)?.results?.bindings?.length || 0

      return { valid: true, resultCount }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
