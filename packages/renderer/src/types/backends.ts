/**
 * Backend type definitions for renderer process
 * These mirror the main process types but are used in Vue components
 */

export type BackendType = 'sparql-1.1' | 'graphstudio' | 'neptune' | 'stardog'
export type AuthType = 'none' | 'basic' | 'bearer' | 'custom'

/**
 * Backend configuration (non-sensitive metadata)
 * Renderer only sees this - credentials never exposed to renderer
 */
export interface BackendConfig {
  id: string
  name: string
  type: BackendType
  endpoint: string
  authType: AuthType
  createdAt: number
  updatedAt: number
  providerConfig?: string
  allowInsecure?: boolean
}

/**
 * Partial backend config for creation/updates
 */
export interface BackendConfigInput {
  name: string
  type: BackendType
  endpoint: string
  authType: AuthType
  providerConfig?: string
  allowInsecure?: boolean
}

/**
 * Credentials input (only used when creating/updating backends)
 * Never stored in Pinia - passed directly to IPC
 */
export interface BackendCredentialsInput {
  // Basic Auth
  username?: string
  password?: string

  // Bearer Token
  token?: string

  // Custom Headers
  headers?: Record<string, string>
}

/**
 * Backend type display names for UI
 */
export const BACKEND_TYPE_LABELS: Record<BackendType, string> = {
  'sparql-1.1': 'Generic SPARQL 1.1',
  graphstudio: 'Altair Graph Studio',
  neptune: 'AWS Neptune',
  stardog: 'Stardog',
}

/**
 * Auth type display names for UI
 */
export const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  none: 'No Authentication',
  basic: 'Basic Auth (Username/Password)',
  bearer: 'Bearer Token',
  custom: 'Custom Headers',
}

/**
 * Test connection result
 */
export interface TestConnectionResult {
  success: boolean
  message: string
  responseTime?: number // milliseconds
}
