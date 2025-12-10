/**
 * Mobi Knowledge Graph Platform Types
 * Based on Mobi REST API v4.2.0
 */

/**
 * Catalog in Mobi (local or distributed)
 */
export interface MobiCatalog {
  id: string // IRI
  iri: string // Same as id, kept for consistency
  title: string // Display name from dcterms:title
  description?: string
  type?: 'local' | 'distributed'
}

/**
 * Record types supported by Mobi
 */
export type MobiRecordType =
  | 'ontology-record'
  | 'dataset-record'
  | 'mapping-record'
  | 'shapes-graph-record'
  | 'versioned-record'
  | 'versioned-rdf-record'
  | 'unversioned-record'

/**
 * Map user-friendly record types to Mobi ontology IRIs
 */
export const MOBI_RECORD_TYPE_IRIS: Record<MobiRecordType, string> = {
  'ontology-record': 'http://mobi.com/ontologies/ontology-editor#OntologyRecord',
  'dataset-record': 'http://mobi.com/ontologies/dataset#DatasetRecord',
  'mapping-record': 'http://mobi.com/ontologies/delimited#MappingRecord',
  'shapes-graph-record': 'http://mobi.com/ontologies/shapes-graph-editor#ShapesGraphRecord',
  'versioned-record': 'http://mobi.com/ontologies/catalog#VersionedRecord',
  'versioned-rdf-record': 'http://mobi.com/ontologies/catalog#VersionedRDFRecord',
  'unversioned-record': 'http://mobi.com/ontologies/catalog#UnversionedRecord',
}

/**
 * User-friendly labels for record types
 */
export const MOBI_RECORD_TYPE_LABELS: Record<MobiRecordType, string> = {
  'ontology-record': 'Ontology',
  'dataset-record': 'Dataset',
  'mapping-record': 'Mapping',
  'shapes-graph-record': 'Shapes Graph',
  'versioned-record': 'Versioned Record',
  'versioned-rdf-record': 'Versioned RDF Record',
  'unversioned-record': 'Unversioned Record',
}

/**
 * Record in a Mobi catalog
 */
export interface MobiRecord {
  id: string // IRI
  iri: string // Same as id
  title: string // Display name from dcterms:title
  type: string // Record type IRI
  description?: string
  modified?: string // ISO date string
  keywords?: string[]
}

/**
 * Branch of a versioned record
 */
export interface MobiBranch {
  id: string // IRI
  iri: string // Same as id
  title: string // Display name from dcterms:title
  createdDate?: string // ISO date string
}

/**
 * Repository in Mobi
 */
export interface MobiRepository {
  id: string // IRI
  iri: string // Same as id
  title: string // Display name
  description?: string
}

/**
 * Provider-specific configuration stored in BackendConfig.providerConfig
 */
export interface MobiConfig {
  // Query mode selection
  queryMode?: 'repository' | 'record' // Determines whether to query repository-wide or a specific record

  // Repository selection (for repository-wide queries)
  repositoryId?: string
  repositoryTitle?: string

  // Catalog selection (for record-specific queries)
  catalogId?: string
  catalogTitle?: string

  // Record selection (for record-specific queries)
  recordId?: string
  recordTitle?: string
  recordType?: string // Record type IRI

  // Branch selection (optional for flexible scoping)
  branchId?: string
  branchTitle?: string

  // Query options
  includeImports?: boolean // Whether to include imports in SPARQL queries
  storeType?: string // 'dataset', 'repository', etc. (defaults to appropriate type based on record)
}

/**
 * Authentication response from Mobi
 */
export interface MobiAuthResponse {
  username: string
  // Session is managed via cookies, no token in response
}

/**
 * Store type for SPARQL queries
 * Determines how queries are executed in Mobi
 * Based on Mobi REST API SparqlRestImpl.java
 */
export type MobiStoreType =
  | 'repository'
  | 'dataset-record'
  | 'ontology-record'
  | 'shapes-graph-record'

/**
 * Get appropriate store type based on record type IRI
 * Maps record type IRIs to the store type path parameter
 */
export function getStoreTypeForRecord(recordTypeIri?: string): MobiStoreType {
  if (!recordTypeIri) {
    return 'repository'
  }

  // Map specific record types to their store type path parameters
  if (recordTypeIri === MOBI_RECORD_TYPE_IRIS['dataset-record']) {
    return 'dataset-record'
  }

  if (recordTypeIri === MOBI_RECORD_TYPE_IRIS['ontology-record']) {
    return 'ontology-record'
  }

  if (recordTypeIri === MOBI_RECORD_TYPE_IRIS['shapes-graph-record']) {
    return 'shapes-graph-record'
  }

  // Default to repository for other record types (mappings, workflows, etc.)
  return 'repository'
}
