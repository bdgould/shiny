# GraphDB Provider Implementation Design

## Overview

This document outlines the design for implementing a GraphDB backend provider to connect to [Ontotext GraphDB](https://graphdb.ontotext.com/). The implementation will support GraphDB versions 9.x through 11.x.

## GraphDB Platform Summary

GraphDB is a semantic graph database built on RDF4J (formerly Sesame) that provides:
- Full SPARQL 1.1 support (query and update)
- RDF4J REST API for SPARQL operations
- Workbench REST API for management operations
- Multiple authentication mechanisms (GDB tokens, Basic auth, OpenID, Kerberos)
- Repository-based data organization

### Version Differences

| Feature | v9.x | v10.x | v11.x |
|---------|------|-------|-------|
| Editions | Free, SE, EE | Unified | Unified |
| Java | 8+ | 11+ | 21+ |
| RDF4J | 3.x | 4.x | 5.x |
| Cluster | Master/Worker | Raft-based | Raft-based |
| OntoRefine | Included | Separate product | Separate product |
| GraphQL | N/A | N/A | Built-in |

### API Endpoints (Common across versions)

**RDF4J REST API (SPARQL):**
- Query: `GET/POST /repositories/{repo-id}`
- Update: `POST /repositories/{repo-id}/statements`
- Graph Store: `/repositories/{repo-id}/rdf-graphs/service`

**Workbench REST API (Management):**
- Login: `POST /rest/login/{username}` with `X-GraphDB-Password` header
- Login (alt): `POST /rest/login` with JSON body `{"username":"...", "password":"..."}`
- Repositories: `GET /rest/repositories`
- Repository info: `GET /rest/repositories/{id}`
- Namespaces: `GET /repositories/{id}/namespaces`

**Authentication:**
- GDB Token: Returned in `Authorization` header after login, format: `GDB eyJ1c2...`
- Basic Auth: Standard HTTP Basic authentication
- Token validity: 30 days by default

---

## File Structure

```
packages/main/src/
├── backends/
│   ├── providers/
│   │   ├── GraphDBProvider.ts      # Main provider implementation
│   │   └── graphdb-types.ts        # Type definitions
│   ├── BackendFactory.ts           # Register new provider
│   └── types.ts                    # Add 'graphdb' to BackendType
├── ipc/
│   └── graphdb.ts                  # IPC handlers for UI operations
```

---

## Type Definitions (`graphdb-types.ts`)

```typescript
/**
 * GraphDB Backend Provider Types
 * Supports GraphDB versions 9.x - 11.x
 */

/**
 * GraphDB version family for API compatibility
 */
export type GraphDBVersionFamily = '9.x' | '10.x' | '11.x' | 'unknown'

/**
 * Repository access mode
 */
export type RepositoryAccessMode = 'r' | 'rw' // read-only or read-write

/**
 * Repository state
 */
export type RepositoryState = 'active' | 'inactive' | 'initializing' | 'error'

/**
 * Repository information from GraphDB
 */
export interface GraphDBRepository {
  id: string                    // Repository ID (used in URLs)
  title: string                 // Display name
  uri: string                   // Full repository URI
  state: RepositoryState        // Current state
  readable: boolean             // Has read access
  writable: boolean             // Has write access
  type?: string                 // Repository type (free, se, ee)
  sesameType?: string           // RDF4J repository type
  location?: string             // Storage location (local/remote)
  externalUrl?: string          // External SPARQL endpoint URL if configured
}

/**
 * Namespace prefix mapping
 */
export interface GraphDBNamespace {
  prefix: string
  namespace: string             // Full namespace URI
}

/**
 * Server information response
 */
export interface GraphDBServerInfo {
  productName: string           // "GraphDB Free", "GraphDB", etc.
  productVersion: string        // e.g., "10.5.0", "11.1.0"
  versionFamily: GraphDBVersionFamily
  sesameVersion?: string        // RDF4J/Sesame version
  connectorState?: string       // Connector status
}

/**
 * Authentication response
 */
export interface GraphDBAuthResponse {
  token: string                 // GDB token for subsequent requests
  username: string
  authorities: string[]         // User roles/permissions
  appSettings?: Record<string, unknown>
}

/**
 * Provider-specific configuration stored in BackendConfig.providerConfig
 */
export interface GraphDBConfig {
  // Repository selection
  repositoryId: string          // Selected repository ID
  repositoryTitle?: string      // Display name for UI

  // Version handling
  detectedVersion?: string      // Detected server version
  versionFamily?: GraphDBVersionFamily

  // Advanced options
  inferenceEnabled?: boolean    // Enable inference for queries (default: true)
  sameAs?: boolean              // Enable owl:sameAs reasoning
  timeout?: number              // Query timeout in seconds

  // Namespace prefixes (cached for query assistance)
  namespaces?: GraphDBNamespace[]
}

/**
 * Query parameters for GraphDB SPARQL endpoint
 */
export interface GraphDBQueryParams {
  query: string
  infer?: boolean               // Enable inference (default: true)
  sameAs?: boolean              // Enable owl:sameAs
  timeout?: number              // Query timeout in seconds
  distinct?: boolean            // Force distinct results
  limit?: number                // Result limit
  offset?: number               // Result offset
}

/**
 * Health check response
 */
export interface GraphDBHealthResponse {
  status: 'green' | 'yellow' | 'red'
  message?: string
}

/**
 * Login request body format (for v10+)
 */
export interface GraphDBLoginRequest {
  username: string
  password: string
}
```

---

## Provider Implementation (`GraphDBProvider.ts`)

### Class Structure

```typescript
/**
 * GraphDB Provider
 * Supports Ontotext GraphDB versions 9.x through 11.x
 *
 * Key features:
 * - GDB token-based authentication with caching
 * - Automatic version detection and API compatibility
 * - Repository-scoped SPARQL queries
 * - Inference control (infer parameter)
 */

import axios, { AxiosInstance } from 'axios'
import { Parser } from 'sparqljs'
import { BaseProvider } from './BaseProvider.js'
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult } from '../types.js'
import type { GraphDBConfig, GraphDBVersionFamily } from './graphdb-types.js'

const parser = new Parser()

// Token cache for authenticated sessions
interface TokenCacheEntry {
  token: string
  timestamp: number
}

const tokenCache = new Map<string, TokenCacheEntry>()
const TOKEN_CACHE_TTL = 24 * 60 * 60 * 1000  // 24 hours (tokens valid for 30 days)

export class GraphDBProvider extends BaseProvider {
  readonly type = 'graphdb' as const

  /**
   * Build SPARQL query endpoint URL
   * Format: {baseUrl}/repositories/{repositoryId}
   */
  protected buildEndpointUrl(config: BackendConfig): string {
    let providerConfig: GraphDBConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      return config.endpoint
    }

    if (!providerConfig?.repositoryId) {
      return config.endpoint
    }

    // Ensure base URL doesn't end with slash
    const baseUrl = config.endpoint.replace(/\/+$/, '')

    return `${baseUrl}/repositories/${encodeURIComponent(providerConfig.repositoryId)}`
  }

  /**
   * Authenticate and get GDB token
   * Supports multiple login endpoint formats for version compatibility
   */
  private async authenticate(
    config: BackendConfig,
    credentials: BackendCredentials
  ): Promise<string> {
    const cacheKey = `${config.endpoint}-${credentials.username}`

    // Check token cache
    const cached = tokenCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
      return cached.token
    }

    const baseUrl = config.endpoint.replace(/\/+$/, '')
    const httpsAgent = this.createHttpsAgent(config)

    // Try modern login endpoint first (v10+)
    try {
      const response = await axios.post(
        `${baseUrl}/rest/login`,
        { username: credentials.username, password: credentials.password },
        {
          headers: { 'Content-Type': 'application/json' },
          httpsAgent,
          timeout: 10000,
        }
      )

      const token = response.headers['authorization']
      if (token) {
        tokenCache.set(cacheKey, { token, timestamp: Date.now() })
        return token
      }
    } catch (error) {
      // Fall through to alternative endpoint
    }

    // Try alternative login endpoint (v9.x style)
    try {
      const response = await axios.post(
        `${baseUrl}/rest/login/${encodeURIComponent(credentials.username!)}`,
        null,
        {
          headers: {
            'X-GraphDB-Password': credentials.password!,
            'Content-Type': 'application/json'
          },
          httpsAgent,
          timeout: 10000,
        }
      )

      const token = response.headers['authorization']
      if (token) {
        tokenCache.set(cacheKey, { token, timestamp: Date.now() })
        return token
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        throw new Error('Authentication failed: Invalid username or password')
      }
      throw error
    }

    throw new Error('Authentication failed: No token received')
  }

  /**
   * Get authentication headers
   * Uses GDB token if available, falls back to Basic auth
   */
  private async getGraphDBAuthHeaders(
    config: BackendConfig,
    credentials?: BackendCredentials
  ): Promise<Record<string, string>> {
    if (!credentials) {
      return {}
    }

    // If we have a pre-existing token (bearer auth type), use it directly
    if (config.authType === 'bearer' && credentials.token) {
      // Check if it's already a GDB token or needs formatting
      const token = credentials.token.startsWith('GDB ')
        ? credentials.token
        : `GDB ${credentials.token}`
      return { 'Authorization': token }
    }

    // For basic auth, try to get a GDB token first (better for session management)
    if (config.authType === 'basic' && credentials.username && credentials.password) {
      try {
        const token = await this.authenticate(config, credentials)
        return { 'Authorization': token }
      } catch {
        // Fall back to Basic auth if token auth fails
        const encoded = Buffer.from(
          `${credentials.username}:${credentials.password}`
        ).toString('base64')
        return { 'Authorization': `Basic ${encoded}` }
      }
    }

    // Use inherited basic auth handling
    return this.getAuthHeaders(config, credentials)
  }

  /**
   * Build query parameters for GraphDB SPARQL endpoint
   */
  private buildQueryParams(config: BackendConfig): Record<string, string> {
    const params: Record<string, string> = {}

    let providerConfig: GraphDBConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      return params
    }

    if (providerConfig) {
      // Inference is enabled by default in GraphDB
      if (providerConfig.inferenceEnabled === false) {
        params['infer'] = 'false'
      }

      if (providerConfig.sameAs === false) {
        params['sameAs'] = 'false'
      }

      if (providerConfig.timeout) {
        params['timeout'] = String(providerConfig.timeout)
      }
    }

    return params
  }

  /**
   * Execute SPARQL query against GraphDB repository
   */
  async execute(
    config: BackendConfig,
    query: string,
    credentials?: BackendCredentials
  ): Promise<QueryResult> {
    // Validate query size
    if (query.length > 100000) {
      throw new Error('Query too large (max 100KB)')
    }

    // Validate repository configuration
    let providerConfig: GraphDBConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      throw new Error('Invalid GraphDB configuration')
    }

    if (!providerConfig?.repositoryId) {
      throw new Error('No repository selected. Please select a repository in backend configuration.')
    }

    try {
      const endpoint = this.buildEndpointUrl(config)
      const queryType = this.detectQueryType(query)
      const acceptHeader = this.getAcceptHeader(queryType)
      const isRdfResponse = queryType === 'CONSTRUCT' || queryType === 'DESCRIBE'

      // Get auth headers (with GDB token if possible)
      const authHeaders = await this.getGraphDBAuthHeaders(config, credentials)

      // Build query parameters
      const queryParams = this.buildQueryParams(config)

      console.log('[GraphDBProvider] Executing SPARQL query:', {
        endpoint,
        queryType,
        acceptHeader,
        queryLength: query.length,
        queryPreview: query.substring(0, 200),
      })

      // Execute query using RDF4J SPARQL protocol
      const response = await axios({
        method: 'POST',
        url: endpoint,
        params: queryParams,
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': acceptHeader,
          ...authHeaders,
        },
        data: query,
        timeout: (providerConfig.timeout || 30) * 1000,
        responseType: isRdfResponse ? 'text' : 'json',
        httpsAgent: this.createHttpsAgent(config),
      })

      console.log('[GraphDBProvider] Query executed successfully:', {
        statusCode: response.status,
        contentType: response.headers['content-type'],
      })

      return {
        data: response.data,
        queryType,
        contentType: response.headers['content-type'] || 'unknown',
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status

        // Handle auth errors - clear token cache and suggest re-auth
        if (statusCode === 401 || statusCode === 403) {
          // Clear cached token
          const cacheKey = `${config.endpoint}-${credentials?.username}`
          tokenCache.delete(cacheKey)

          throw new Error(
            `Authentication failed (${statusCode}): Please check your credentials or re-authenticate`
          )
        }

        console.error('[GraphDBProvider] SPARQL query failed:', {
          statusCode,
          statusText: error.response?.statusText,
          responseData: error.response?.data,
        })

        const message = error.response?.data?.message ||
                       error.response?.data ||
                       error.message
        throw new Error(`SPARQL query failed (${statusCode || 'network error'}): ${message}`)
      }

      if (error instanceof Error) {
        throw new Error(`Query execution failed: ${error.message}`)
      }

      throw new Error('Query execution failed: Unknown error')
    }
  }

  /**
   * Validate GraphDB backend configuration
   */
  async validate(
    config: BackendConfig,
    credentials?: BackendCredentials
  ): Promise<ValidationResult> {
    // Validate URL format
    if (!this.validateUrl(config.endpoint)) {
      return { valid: false, error: 'Invalid endpoint URL' }
    }

    // Check provider config
    let providerConfig: GraphDBConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      return { valid: false, error: 'Invalid provider configuration' }
    }

    if (!providerConfig?.repositoryId) {
      return { valid: false, error: 'No repository selected' }
    }

    const endpoint = this.buildEndpointUrl(config)
    const testQuery = 'SELECT (COUNT(?s) as ?subjects) WHERE { ?s ?p ?o . } LIMIT 1'

    try {
      const authHeaders = await this.getGraphDBAuthHeaders(config, credentials)

      const response = await axios({
        method: 'POST',
        url: endpoint,
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': 'application/sparql-results+json, application/json',
          ...authHeaders,
        },
        data: testQuery,
        timeout: 10000,
        responseType: 'json',
        httpsAgent: this.createHttpsAgent(config),
      })

      if (response.status === 200) {
        return { valid: true }
      }

      return { valid: false, error: `Unexpected status code: ${response.status}` }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        const message = error.response?.data?.message || error.message
        return {
          valid: false,
          error: `Connection failed (${statusCode || 'network error'}): ${message}`,
        }
      }

      if (error instanceof Error) {
        return { valid: false, error: `Connection failed: ${error.message}` }
      }

      return { valid: false, error: 'Connection failed: Unknown error' }
    }
  }

  /**
   * Detect SPARQL query type
   */
  private detectQueryType(query: string): 'SELECT' | 'CONSTRUCT' | 'DESCRIBE' | 'ASK' {
    try {
      const parsed = parser.parse(query)
      if ('queryType' in parsed) {
        const type = parsed.queryType.toUpperCase()
        if (type === 'SELECT' || type === 'CONSTRUCT' || type === 'DESCRIBE' || type === 'ASK') {
          return type
        }
      }
      return 'SELECT'
    } catch {
      return 'SELECT'
    }
  }

  /**
   * Get appropriate Accept header based on query type
   */
  private getAcceptHeader(queryType: 'SELECT' | 'CONSTRUCT' | 'DESCRIBE' | 'ASK'): string {
    switch (queryType) {
      case 'SELECT':
      case 'ASK':
        return 'application/sparql-results+json, application/json'
      case 'CONSTRUCT':
      case 'DESCRIBE':
        return 'text/turtle'
      default:
        return 'application/sparql-results+json, application/json'
    }
  }
}
```

---

## IPC Handlers (`ipc/graphdb.ts`)

```typescript
/**
 * IPC handlers for GraphDB-specific operations
 */

import { ipcMain } from 'electron'
import axios from 'axios'
import https from 'https'
import type {
  GraphDBRepository,
  GraphDBServerInfo,
  GraphDBNamespace,
  GraphDBVersionFamily
} from '../backends/providers/graphdb-types.js'

// Validate sender is authorized
function isAuthorizedSender(frame: Electron.WebFrameMain): boolean {
  const url = frame.url
  return url.startsWith('file://') || url.startsWith('http://localhost:5173')
}

/**
 * Create axios instance with SSL configuration
 */
function createAxiosInstance(allowInsecure: boolean = false) {
  return axios.create({
    httpsAgent: new https.Agent({
      rejectUnauthorized: !allowInsecure,
    }),
    timeout: 15000,
  })
}

/**
 * Authenticate with GraphDB and return token
 * Tries multiple login endpoints for version compatibility
 */
async function authenticateGraphDB(
  axiosInstance: any,
  baseUrl: string,
  username: string,
  password: string
): Promise<string> {
  // Try v10+ JSON login
  try {
    const response = await axiosInstance.post(
      `${baseUrl}/rest/login`,
      { username, password },
      { headers: { 'Content-Type': 'application/json' } }
    )
    const token = response.headers['authorization']
    if (token) return token
  } catch {}

  // Try v9.x header-based login
  try {
    const response = await axiosInstance.post(
      `${baseUrl}/rest/login/${encodeURIComponent(username)}`,
      null,
      { headers: { 'X-GraphDB-Password': password } }
    )
    const token = response.headers['authorization']
    if (token) return token
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error('Authentication failed: Invalid username or password')
    }
    throw error
  }

  throw new Error('Authentication failed: No token received')
}

/**
 * Detect GraphDB version from server info
 */
function detectVersionFamily(version: string): GraphDBVersionFamily {
  if (!version) return 'unknown'

  const major = parseInt(version.split('.')[0], 10)
  if (major >= 11) return '11.x'
  if (major >= 10) return '10.x'
  if (major >= 9) return '9.x'
  return 'unknown'
}

/**
 * Normalize repository state from various API formats
 */
function normalizeRepositoryState(
  state: string | undefined
): 'active' | 'inactive' | 'initializing' | 'error' {
  if (!state) return 'inactive'
  const lower = state.toLowerCase()
  if (lower === 'active' || lower === 'running' || lower === 'ready') return 'active'
  if (lower === 'initializing' || lower === 'starting') return 'initializing'
  if (lower === 'error' || lower === 'failed') return 'error'
  return 'inactive'
}

/**
 * Test authentication with GraphDB
 */
ipcMain.handle(
  'graphdb:authenticate',
  async (event, { baseUrl, username, password, allowInsecure }) => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl || !username || !password) {
      throw new Error('Base URL, username, and password are required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      const token = await authenticateGraphDB(
        axiosInstance,
        normalizedUrl,
        username,
        password
      )

      return { success: true, token }
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Authentication failed: Unknown error')
    }
  }
)

/**
 * Get GraphDB server information
 */
ipcMain.handle(
  'graphdb:getServerInfo',
  async (event, { baseUrl, credentials, allowInsecure }) => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl) {
      throw new Error('Base URL is required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      let authHeaders: Record<string, string> = {}
      if (credentials?.username && credentials?.password) {
        const token = await authenticateGraphDB(
          axiosInstance,
          normalizedUrl,
          credentials.username,
          credentials.password
        )
        authHeaders = { 'Authorization': token }
      }

      // Try multiple endpoints to get version info
      let productVersion = ''
      let productName = 'GraphDB'

      // Try /rest/info/version endpoint (v10+)
      try {
        const response = await axiosInstance.get(
          `${normalizedUrl}/rest/info/version`,
          { headers: authHeaders }
        )
        productVersion = response.data?.productVersion || response.data
      } catch {}

      // Try /repositories endpoint to confirm connectivity
      if (!productVersion) {
        try {
          const response = await axiosInstance.get(
            `${normalizedUrl}/repositories`,
            {
              headers: {
                'Accept': 'application/json',
                ...authHeaders
              }
            }
          )
          // If we get here, server is reachable
          productName = 'GraphDB (version unknown)'
        } catch {}
      }

      const versionFamily = detectVersionFamily(productVersion)

      const serverInfo: GraphDBServerInfo = {
        productName,
        productVersion,
        versionFamily,
      }

      return serverInfo
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        if (statusCode === 401 || statusCode === 403) {
          throw new Error('Authentication required to access server information')
        }
        throw new Error(`Failed to get server info (${statusCode}): ${error.message}`)
      }
      throw new Error('Failed to get server information')
    }
  }
)

/**
 * List all repositories from GraphDB
 */
ipcMain.handle(
  'graphdb:listRepositories',
  async (event, { baseUrl, credentials, allowInsecure }) => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl) {
      throw new Error('Base URL is required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      let authHeaders: Record<string, string> = {}
      if (credentials?.username && credentials?.password) {
        try {
          const token = await authenticateGraphDB(
            axiosInstance,
            normalizedUrl,
            credentials.username,
            credentials.password
          )
          authHeaders = { 'Authorization': token }
        } catch {
          // Fall back to Basic auth
          const encoded = Buffer.from(
            `${credentials.username}:${credentials.password}`
          ).toString('base64')
          authHeaders = { 'Authorization': `Basic ${encoded}` }
        }
      }

      // Try REST API first (provides more details)
      let repositories: GraphDBRepository[] = []

      try {
        const response = await axiosInstance.get(
          `${normalizedUrl}/rest/repositories`,
          {
            headers: {
              'Accept': 'application/json',
              ...authHeaders
            }
          }
        )

        // REST API returns detailed repository info
        const data = Array.isArray(response.data) ? response.data : []
        repositories = data.map((repo: any) => ({
          id: repo.id,
          title: repo.title || repo.id,
          uri: repo.uri || `${normalizedUrl}/repositories/${repo.id}`,
          state: normalizeRepositoryState(repo.state),
          readable: repo.readable !== false,
          writable: repo.writable !== false,
          type: repo.type,
          sesameType: repo.sesameType,
          location: repo.location,
          externalUrl: repo.externalUrl,
        }))
      } catch {
        // Fall back to RDF4J repositories endpoint
        const response = await axiosInstance.get(
          `${normalizedUrl}/repositories`,
          {
            headers: {
              'Accept': 'application/sparql-results+json',
              ...authHeaders
            }
          }
        )

        // RDF4J endpoint returns SPARQL results format
        const bindings = response.data?.results?.bindings || []
        repositories = bindings.map((binding: any) => ({
          id: binding.id?.value || '',
          title: binding.title?.value || binding.id?.value || '',
          uri: binding.uri?.value || `${normalizedUrl}/repositories/${binding.id?.value}`,
          state: 'active' as const,
          readable: binding.readable?.value !== 'false',
          writable: binding.writable?.value !== 'false',
        }))
      }

      console.log('[GraphDB] Found repositories:', repositories.length)

      // Sort: active first, then by title
      repositories.sort((a, b) => {
        if (a.state !== b.state) {
          const stateOrder = { active: 0, initializing: 1, inactive: 2, error: 3 }
          return stateOrder[a.state] - stateOrder[b.state]
        }
        return a.title.localeCompare(b.title)
      })

      return repositories
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        if (statusCode === 401 || statusCode === 403) {
          throw new Error('Authentication failed. Please check your credentials.')
        }
        throw new Error(`Failed to list repositories (${statusCode}): ${error.message}`)
      }
      throw new Error('Failed to list repositories')
    }
  }
)

/**
 * Get repository details including namespaces
 */
ipcMain.handle(
  'graphdb:getRepositoryDetails',
  async (event, { baseUrl, repositoryId, credentials, allowInsecure }) => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl || !repositoryId) {
      throw new Error('Base URL and repository ID are required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      let authHeaders: Record<string, string> = {}
      if (credentials?.username && credentials?.password) {
        try {
          const token = await authenticateGraphDB(
            axiosInstance,
            normalizedUrl,
            credentials.username,
            credentials.password
          )
          authHeaders = { 'Authorization': token }
        } catch {
          const encoded = Buffer.from(
            `${credentials.username}:${credentials.password}`
          ).toString('base64')
          authHeaders = { 'Authorization': `Basic ${encoded}` }
        }
      }

      // Fetch namespaces
      let namespaces: GraphDBNamespace[] = []
      try {
        const response = await axiosInstance.get(
          `${normalizedUrl}/repositories/${encodeURIComponent(repositoryId)}/namespaces`,
          {
            headers: {
              'Accept': 'application/sparql-results+json',
              ...authHeaders
            }
          }
        )

        const bindings = response.data?.results?.bindings || []
        namespaces = bindings.map((binding: any) => ({
          prefix: binding.prefix?.value || '',
          namespace: binding.namespace?.value || '',
        }))
      } catch (error) {
        console.warn('[GraphDB] Failed to fetch namespaces:', error)
      }

      // Get repository size (triple count)
      let tripleCount: number | undefined
      try {
        const response = await axiosInstance.get(
          `${normalizedUrl}/repositories/${encodeURIComponent(repositoryId)}/size`,
          { headers: authHeaders }
        )
        tripleCount = parseInt(response.data, 10)
      } catch {}

      return {
        repositoryId,
        namespaces,
        tripleCount,
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        throw new Error(`Failed to get repository details (${statusCode}): ${error.message}`)
      }
      throw new Error('Failed to get repository details')
    }
  }
)

/**
 * Test repository connection with a simple query
 */
ipcMain.handle(
  'graphdb:testConnection',
  async (event, { baseUrl, repositoryId, credentials, allowInsecure }) => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl || !repositoryId) {
      throw new Error('Base URL and repository ID are required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      let authHeaders: Record<string, string> = {}
      if (credentials?.username && credentials?.password) {
        try {
          const token = await authenticateGraphDB(
            axiosInstance,
            normalizedUrl,
            credentials.username,
            credentials.password
          )
          authHeaders = { 'Authorization': token }
        } catch {
          const encoded = Buffer.from(
            `${credentials.username}:${credentials.password}`
          ).toString('base64')
          authHeaders = { 'Authorization': `Basic ${encoded}` }
        }
      }

      // Simple test query
      const testQuery = 'SELECT * WHERE { ?s ?p ?o } LIMIT 1'

      const response = await axiosInstance.post(
        `${normalizedUrl}/repositories/${encodeURIComponent(repositoryId)}`,
        testQuery,
        {
          headers: {
            'Content-Type': 'application/sparql-query',
            'Accept': 'application/sparql-results+json',
            ...authHeaders,
          },
          timeout: 10000,
        }
      )

      return {
        success: true,
        message: `Successfully connected to repository '${repositoryId}'`,
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        if (statusCode === 401 || statusCode === 403) {
          return { success: false, message: 'Authentication failed' }
        }
        if (statusCode === 404) {
          return { success: false, message: 'Repository not found' }
        }
        return { success: false, message: `Connection failed (${statusCode})` }
      }
      return { success: false, message: 'Connection failed' }
    }
  }
)
```

---

## Integration Points

### 1. Update `types.ts`

Add `'graphdb'` to the `BackendType` union:

```typescript
export type BackendType = 'sparql-1.1' | 'graphstudio' | 'neptune' | 'stardog' | 'mobi' | 'graphdb'
```

### 2. Update `BackendFactory.ts`

Register the new provider:

```typescript
import { GraphDBProvider } from './providers/GraphDBProvider.js'

// In initializeProviders():
providers.set('graphdb', new GraphDBProvider())
```

### 3. Preload API (if applicable)

Add IPC channel definitions for the renderer process.

---

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Authentication Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. User enters credentials (username/password)             │
│                          │                                   │
│                          ▼                                   │
│  2. Try POST /rest/login (v10+ JSON format)                │
│                          │                                   │
│              ┌───────────┴───────────┐                      │
│              │                       │                       │
│        Success                   Failure                     │
│              │                       │                       │
│              ▼                       ▼                       │
│  3a. Extract token from      3b. Try POST /rest/login/{user}│
│      Authorization header        with X-GraphDB-Password    │
│              │                       │                       │
│              │               ┌───────┴───────┐              │
│              │               │               │               │
│              │          Success          Failure             │
│              │               │               │               │
│              │               ▼               ▼               │
│              │      Extract token    Return error            │
│              │               │                               │
│              └───────┬───────┘                              │
│                      │                                       │
│                      ▼                                       │
│  4. Cache token with TTL (24 hours)                         │
│                      │                                       │
│                      ▼                                       │
│  5. Use token in Authorization header for subsequent calls  │
│     Format: "GDB eyJ1c2VybmFtZSI6ImFkbWluLi4."             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Version Compatibility Matrix

| Feature | v9.x | v10.x | v11.x |
|---------|------|-------|-------|
| `/rest/login` (JSON body) | ❌ | ✅ | ✅ |
| `/rest/login/{user}` (header) | ✅ | ✅ | ✅ |
| `/rest/repositories` | ✅ | ✅ | ✅ |
| `/repositories` (RDF4J) | ✅ | ✅ | ✅ |
| `/repositories/{id}` (SPARQL) | ✅ | ✅ | ✅ |
| `/rest/info/version` | ❌ | ✅ | ✅ |
| `infer` query parameter | ✅ | ✅ | ✅ |
| GDB token format | ✅ | ✅ | ✅ |
| Basic auth fallback | ✅ | ✅ | ✅ |

---

## Configuration UI Considerations

The renderer/frontend should provide:

1. **Connection Settings:**
   - Server URL (e.g., `http://localhost:7200`)
   - Authentication type (None, Basic, GDB Token)
   - Username/password fields
   - "Allow insecure SSL" checkbox

2. **Repository Selection:**
   - Dropdown populated from `graphdb:listRepositories`
   - Show repository state (active/inactive)
   - Display triple count when available

3. **Query Options:**
   - Inference enabled/disabled toggle
   - Query timeout setting
   - owl:sameAs reasoning toggle

4. **Namespace Management:**
   - Display detected prefixes from repository
   - Allow custom prefix definitions

---

## Error Handling

| Error Code | Meaning | User Action |
|------------|---------|-------------|
| 401 | Unauthorized | Check credentials |
| 403 | Forbidden | Check user permissions for repository |
| 404 | Not found | Verify repository ID exists |
| 503 | Service unavailable | Repository may be initializing |
| Timeout | Query too slow | Add LIMIT, check repository size |

---

## Testing Checklist

- [ ] Authentication with v9.x server
- [ ] Authentication with v10.x server
- [ ] Authentication with v11.x server
- [ ] Token caching and refresh
- [ ] Basic auth fallback
- [ ] No-auth access (when security disabled)
- [ ] Repository listing
- [ ] SPARQL SELECT queries
- [ ] SPARQL CONSTRUCT queries
- [ ] SPARQL ASK queries
- [ ] Inference parameter handling
- [ ] Query timeout handling
- [ ] SSL/TLS with valid certificates
- [ ] SSL bypass for self-signed certs
- [ ] Large result sets
- [ ] Query validation errors

---

## Future Enhancements

1. **SPARQL Update Support** - Write operations via `/repositories/{id}/statements`
2. **Named Graph Management** - Graph Store HTTP Protocol support
3. **Cluster Awareness** - Detect cluster configuration for v10+
4. **Import/Export** - Data loading via REST API
5. **Connectors** - Elasticsearch/Solr connector management
6. **GraphQL** - v11+ GraphQL endpoint support
7. **Saved Queries** - Integration with GraphDB's saved query feature
