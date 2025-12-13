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

import axios from 'axios'
import { Parser } from 'sparqljs'
import { BaseProvider } from './BaseProvider.js'
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult } from '../types.js'
import type { GraphDBConfig } from './graphdb-types.js'

const parser = new Parser()

// Token cache for authenticated sessions
interface TokenCacheEntry {
  token: string
  timestamp: number
}

const tokenCache = new Map<string, TokenCacheEntry>()
const TOKEN_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours (tokens valid for 30 days)

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
    if (!credentials.username || !credentials.password) {
      throw new Error('Username and password are required for authentication')
    }

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
        console.log('[GraphDBProvider] Authenticated successfully via /rest/login')
        return token
      }
    } catch (error) {
      // Fall through to alternative endpoint
      console.log('[GraphDBProvider] /rest/login failed, trying alternative endpoint')
    }

    // Try alternative login endpoint (v9.x style)
    try {
      const response = await axios.post(
        `${baseUrl}/rest/login/${encodeURIComponent(credentials.username)}`,
        null,
        {
          headers: {
            'X-GraphDB-Password': credentials.password,
            'Content-Type': 'application/json',
          },
          httpsAgent,
          timeout: 10000,
        }
      )

      const token = response.headers['authorization']
      if (token) {
        tokenCache.set(cacheKey, { token, timestamp: Date.now() })
        console.log('[GraphDBProvider] Authenticated successfully via /rest/login/{username}')
        return token
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        throw new Error('Authentication failed: Invalid username or password')
      }
      // For other errors, we'll fall back to Basic auth
      console.log('[GraphDBProvider] Token authentication failed, will use Basic auth')
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
      return { Authorization: token }
    }

    // For basic auth, try to get a GDB token first (better for session management)
    if (config.authType === 'basic' && credentials.username && credentials.password) {
      try {
        const token = await this.authenticate(config, credentials)
        return { Authorization: token }
      } catch {
        // Fall back to Basic auth if token auth fails
        console.log('[GraphDBProvider] Falling back to Basic auth')
        const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString(
          'base64'
        )
        return { Authorization: `Basic ${encoded}` }
      }
    }

    // Use inherited basic auth handling for other cases
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
      throw new Error(
        'No repository selected. Please select a repository in backend configuration.'
      )
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
          Accept: acceptHeader,
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

        const message = error.response?.data?.message || error.response?.data || error.message
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
          Accept: 'application/sparql-results+json, application/json',
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

  /**
   * Clear cached token for a specific endpoint/user combination
   * Useful when credentials change or token expires
   */
  static clearTokenCache(endpoint?: string, username?: string): void {
    if (endpoint && username) {
      const cacheKey = `${endpoint}-${username}`
      tokenCache.delete(cacheKey)
    } else {
      tokenCache.clear()
    }
  }
}
