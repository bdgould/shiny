/**
 * Type definitions for ontology cache in the renderer process
 * Re-exports main process types and adds renderer-specific types
 */

import type {
  OntologyElement,
  OntologyClass,
  OntologyProperty,
  OntologyIndividual,
  AnyOntologyElement,
  OntologyElementType,
  CacheConfig,
  CacheLoadStatus,
  CacheProgress,
  CacheStats,
  CacheMetadata,
  OntologyCache,
  CacheQueryTemplates,
  PropertyType
} from '../../../main/src/backends/ontologyTypes'

// Re-export main types
export type {
  OntologyElement,
  OntologyClass,
  OntologyProperty,
  OntologyIndividual,
  AnyOntologyElement,
  OntologyElementType,
  CacheConfig,
  CacheLoadStatus,
  CacheProgress,
  CacheStats,
  CacheMetadata,
  OntologyCache,
  CacheQueryTemplates,
  PropertyType
}

/**
 * IndexedDB database name and version
 */
export const ONTOLOGY_CACHE_DB_NAME = 'shiny-ontology-cache'
export const ONTOLOGY_CACHE_DB_VERSION = 1

/**
 * IndexedDB object store names
 */
export const CACHE_STORES = {
  METADATA: 'metadata',
  CLASSES: 'classes',
  PROPERTIES: 'properties',
  INDIVIDUALS: 'individuals',
  NAMESPACES: 'namespaces'
} as const

/**
 * Search options for querying cached elements
 */
export interface CacheSearchOptions {
  /** Query string to search for (searches IRI, label, description) */
  query: string
  /** Element types to include in search */
  types?: OntologyElementType[]
  /** Maximum number of results to return */
  limit?: number
  /** Case-sensitive search */
  caseSensitive?: boolean
  /** Only match from the start of strings */
  prefixOnly?: boolean
}

/**
 * Search result with relevance score
 */
export interface CacheSearchResult {
  /** The ontology element */
  element: AnyOntologyElement
  /** Relevance score (0-1, higher is better) */
  score: number
  /** Which field matched (for highlighting) */
  matchedField: 'iri' | 'label' | 'description' | 'localName'
}

/**
 * Options for fetching cache from backend
 */
export interface CacheFetchOptions {
  /** Backend ID to fetch cache for */
  backendId: string
  /** Force refresh even if cache is valid */
  force?: boolean
  /** Fetch in background without blocking UI */
  background?: boolean
  /** Progress callback */
  onProgress?: (progress: CacheProgress) => void
}

/**
 * Cache validation result
 */
export interface CacheValidation {
  /** Whether cache exists */
  exists: boolean
  /** Whether cache is valid (not expired) */
  valid: boolean
  /** Whether cache is stale (expired but can serve while revalidating) */
  stale: boolean
  /** Age of cache in milliseconds */
  age?: number
  /** TTL of cache in milliseconds */
  ttl?: number
  /** When cache will expire (timestamp) */
  expiresAt?: number
}

/**
 * Namespace mapping entry
 */
export interface NamespaceEntry {
  /** Backend ID */
  backendId: string
  /** Namespace prefix (e.g., "rdf", "owl") */
  prefix: string
  /** Namespace URI */
  uri: string
}

/**
 * Global cache settings (applies to all backends)
 */
export interface GlobalCacheSettings {
  /** Enable autocomplete from cache */
  enableAutocomplete: boolean
  /** Default TTL for new backends (milliseconds) */
  defaultTtl: number
  /** Default max elements for new backends */
  defaultMaxElements: number
  /** Automatically refresh stale caches in background */
  autoRefresh: boolean
  /** Interval for checking stale caches (milliseconds) */
  refreshCheckInterval: number
}

/**
 * Default global cache settings
 */
export const DEFAULT_GLOBAL_CACHE_SETTINGS: GlobalCacheSettings = {
  enableAutocomplete: true,
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  defaultMaxElements: 50000,
  autoRefresh: true,
  refreshCheckInterval: 5 * 60 * 1000 // 5 minutes
}

/**
 * Default cache configuration (duplicated from main process for renderer access)
 */
export const DEFAULT_CACHE_CONFIG = {
  enabled: false,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  maxElements: 50000,
  queries: {
    classes: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>

SELECT DISTINCT ?iri ?label ?description
WHERE {
  ?iri a owl:Class .
  OPTIONAL { ?iri dc:title ?dcTitle }
  OPTIONAL { ?iri rdfs:label ?rdfsLabel }
  OPTIONAL { ?iri dc:description ?dcDesc }
  OPTIONAL { ?iri rdfs:comment ?rdfsComment }
  BIND(COALESCE(?dcTitle, ?rdfsLabel) AS ?label)
  BIND(COALESCE(?dcDesc, ?rdfsComment) AS ?description)
}
LIMIT 10000`,
    properties: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>

SELECT DISTINCT ?iri ?label ?description ?propertyType ?domain ?range
WHERE {
  {
    ?iri a owl:ObjectProperty .
    BIND("object" AS ?propertyType)
  } UNION {
    ?iri a owl:DatatypeProperty .
    BIND("datatype" AS ?propertyType)
  } UNION {
    ?iri a owl:AnnotationProperty .
    BIND("annotation" AS ?propertyType)
  }
  OPTIONAL { ?iri dc:title ?dcTitle }
  OPTIONAL { ?iri rdfs:label ?rdfsLabel }
  OPTIONAL { ?iri dc:description ?dcDesc }
  OPTIONAL { ?iri rdfs:comment ?rdfsComment }
  OPTIONAL { ?iri rdfs:domain ?domain }
  OPTIONAL { ?iri rdfs:range ?range }
  BIND(COALESCE(?dcTitle, ?rdfsLabel) AS ?label)
  BIND(COALESCE(?dcDesc, ?rdfsComment) AS ?description)
}
LIMIT 10000`,
    individuals: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>

SELECT DISTINCT ?iri ?label ?description ?class
WHERE {
  ?iri a owl:NamedIndividual .
  OPTIONAL { ?iri rdf:type ?class . FILTER(?class != owl:NamedIndividual) }
  OPTIONAL { ?iri dc:title ?dcTitle }
  OPTIONAL { ?iri rdfs:label ?rdfsLabel }
  OPTIONAL { ?iri dc:description ?dcDesc }
  OPTIONAL { ?iri rdfs:comment ?rdfsComment }
  BIND(COALESCE(?dcTitle, ?rdfsLabel) AS ?label)
  BIND(COALESCE(?dcDesc, ?rdfsComment) AS ?description)
}
LIMIT 10000`
  }
}

/**
 * Cache event types for event emitter
 */
export type CacheEventType =
  | 'cache:loaded'
  | 'cache:refreshed'
  | 'cache:invalidated'
  | 'cache:error'
  | 'cache:progress'

/**
 * Cache event payload
 */
export interface CacheEvent {
  /** Backend ID */
  backendId: string
  /** Event type */
  type: CacheEventType
  /** Event timestamp */
  timestamp: number
  /** Event-specific data */
  data?: CacheProgress | CacheStats | Error
}
