/**
 * GraphDB Backend Provider Types
 * Supports GraphDB versions 9.x - 11.x
 */

/**
 * GraphDB version family for API compatibility
 */
export type GraphDBVersionFamily = '9.x' | '10.x' | '11.x' | 'unknown'

/**
 * Repository state
 */
export type RepositoryState = 'active' | 'inactive' | 'initializing' | 'error'

/**
 * Repository information from GraphDB
 */
export interface GraphDBRepository {
  id: string // Repository ID (used in URLs)
  title: string // Display name
  uri: string // Full repository URI
  state: RepositoryState // Current state
  readable: boolean // Has read access
  writable: boolean // Has write access
  type?: string // Repository type (free, se, ee)
  sesameType?: string // RDF4J repository type
  location?: string // Storage location (local/remote)
  externalUrl?: string // External SPARQL endpoint URL if configured
}

/**
 * Namespace prefix mapping
 */
export interface GraphDBNamespace {
  prefix: string
  namespace: string // Full namespace URI
}

/**
 * Server information response
 */
export interface GraphDBServerInfo {
  productName: string // "GraphDB Free", "GraphDB", etc.
  productVersion: string // e.g., "10.5.0", "11.1.0"
  versionFamily: GraphDBVersionFamily
  sesameVersion?: string // RDF4J/Sesame version
}

/**
 * Authentication response
 */
export interface GraphDBAuthResponse {
  success: boolean
  token?: string // GDB token for subsequent requests
  username?: string
  authorities?: string[] // User roles/permissions
}

/**
 * Provider-specific configuration stored in BackendConfig.providerConfig
 */
export interface GraphDBConfig {
  // Repository selection
  repositoryId: string // Selected repository ID
  repositoryTitle?: string // Display name for UI

  // Version handling
  detectedVersion?: string // Detected server version
  versionFamily?: GraphDBVersionFamily

  // Advanced options
  inferenceEnabled?: boolean // Enable inference for queries (default: true)
  sameAs?: boolean // Enable owl:sameAs reasoning
  timeout?: number // Query timeout in seconds

  // Namespace prefixes (cached for query assistance)
  namespaces?: GraphDBNamespace[]
}

/**
 * Repository details with additional metadata
 */
export interface GraphDBRepositoryDetails {
  repositoryId: string
  namespaces: GraphDBNamespace[]
  tripleCount?: number
}

/**
 * Connection test result
 */
export interface GraphDBConnectionResult {
  success: boolean
  message: string
}
