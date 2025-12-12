/**
 * Backend type definitions for main process
 */

import type { CacheConfig } from './ontologyTypes.js'

export type BackendType = 'sparql-1.1' | 'graphstudio' | 'neptune' | 'stardog' | 'mobi'
export type AuthType = 'none' | 'basic' | 'bearer' | 'custom'

/**
 * Backend configuration (non-sensitive metadata)
 * Stored in plaintext via electron-store
 */
export interface BackendConfig {
  id: string // UUID v4
  name: string // User-defined name (max 50 chars)
  type: BackendType // Backend provider type
  endpoint: string // HTTP(S) URL
  authType: AuthType // Authentication method
  createdAt: number // Unix timestamp
  updatedAt: number // Unix timestamp
  providerConfig?: string // JSON-serialized provider-specific configuration (e.g., GraphStudio graphmart/layer selection)
  allowInsecure?: boolean // Allow self-signed/invalid SSL certificates (development only)
  cacheConfig?: CacheConfig // Ontology cache configuration
}

/**
 * Backend credentials (sensitive data)
 * Encrypted via safeStorage before storing
 */
export interface BackendCredentials {
  backendId: string // Foreign key to BackendConfig

  // Basic Auth
  username?: string
  password?: string

  // Bearer Token
  token?: string

  // Custom Headers
  headers?: Record<string, string>
}

/**
 * Validation result for backend configuration
 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Query result structure (returned from providers)
 */
export interface QueryResult {
  data: unknown
  queryType: 'SELECT' | 'CONSTRUCT' | 'DESCRIBE' | 'ASK'
  contentType: string
}
