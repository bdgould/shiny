/**
 * Type definitions for ontology elements caching system
 */

/**
 * Base interface for all ontology elements
 */
export interface OntologyElement {
  /** The full IRI of the element */
  iri: string
  /** Preferred label (dc:title or rdfs:label, Dublin Core takes precedence) */
  label?: string
  /** Description (dc:description or rdfs:comment, Dublin Core takes precedence) */
  description?: string
  /** The namespace URI extracted from the IRI */
  namespace?: string
  /** The local name extracted from the IRI */
  localName?: string
}

/**
 * Represents an OWL Class
 */
export interface OntologyClass extends OntologyElement {
  type: 'class'
}

/**
 * Type of OWL property
 */
export type PropertyType = 'object' | 'datatype' | 'annotation'

/**
 * Represents an OWL Property (Object, Datatype, or Annotation)
 */
export interface OntologyProperty extends OntologyElement {
  type: 'property'
  /** The specific type of property */
  propertyType: PropertyType
  /** Domain IRIs (classes this property can be used with) */
  domain: string[]
  /** Range IRIs (classes or datatypes this property points to) */
  range: string[]
}

/**
 * Represents an OWL Named Individual
 */
export interface OntologyIndividual extends OntologyElement {
  type: 'individual'
  /** IRIs of classes this individual is an instance of */
  classes: string[]
}

/**
 * Union type for any ontology element
 */
export type AnyOntologyElement = OntologyClass | OntologyProperty | OntologyIndividual

/**
 * Element type discriminator
 */
export type OntologyElementType = 'class' | 'property' | 'individual'

/**
 * Default SPARQL query templates for fetching ontology elements
 */
export interface CacheQueryTemplates {
  /** SPARQL query to fetch OWL classes */
  classes: string
  /** SPARQL query to fetch OWL properties */
  properties: string
  /** SPARQL query to fetch OWL named individuals */
  individuals: string
}

/**
 * Configuration for ontology caching for a specific backend
 */
export interface CacheConfig {
  /** Whether caching is enabled for this backend */
  enabled: boolean
  /** Time to live in milliseconds (default: 24 hours = 86400000) */
  ttl: number
  /** Maximum number of elements to cache (safety limit) */
  maxElements: number
  /** Custom SPARQL queries for fetching ontology elements */
  queries: CacheQueryTemplates
}

/**
 * Status of a cache refresh operation
 */
export type CacheLoadStatus = 'idle' | 'loading' | 'refreshing' | 'error' | 'success'

/**
 * Progress information for cache loading
 */
export interface CacheProgress {
  /** Current status */
  status: CacheLoadStatus
  /** Current element type being fetched */
  currentType?: OntologyElementType
  /** Number of elements fetched so far */
  fetchedCount: number
  /** Total estimated elements (if known) */
  totalCount?: number
  /** Error message if status is 'error' */
  error?: string
}

/**
 * Statistics about a cached ontology
 */
export interface CacheStats {
  /** Number of classes cached */
  classCount: number
  /** Number of properties cached */
  propertyCount: number
  /** Number of individuals cached */
  individualCount: number
  /** Total elements */
  totalCount: number
  /** Number of namespaces */
  namespaceCount: number
  /** Approximate size in bytes */
  sizeBytes?: number
}

/**
 * Metadata for a cached ontology
 */
export interface CacheMetadata {
  /** ID of the backend this cache belongs to */
  backendId: string
  /** Timestamp when cache was last updated */
  lastUpdated: number
  /** TTL in milliseconds */
  ttl: number
  /** Cache schema version (for migrations) */
  version: number
  /** Statistics about cached elements */
  stats: CacheStats
}

/**
 * Complete ontology cache for a backend
 */
export interface OntologyCache {
  /** Metadata about the cache */
  metadata: CacheMetadata
  /** Cached classes */
  classes: OntologyClass[]
  /** Cached properties */
  properties: OntologyProperty[]
  /** Cached individuals */
  individuals: OntologyIndividual[]
  /** Namespace prefix to URI mappings */
  namespaces: Record<string, string>
}

/**
 * Current cache schema version
 */
export const CACHE_SCHEMA_VERSION = 1

/**
 * Default cache configuration values
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
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
