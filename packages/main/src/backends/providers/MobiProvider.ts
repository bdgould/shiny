/**
 * Mobi Knowledge Graph Platform provider
 * Supports querying against ontologies, datasets, and other Mobi records
 * with optional branch scoping and import resolution
 */

import axios, { AxiosInstance } from 'axios'
import { Parser } from 'sparqljs'
import { BaseProvider } from './BaseProvider.js'
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult } from '../types.js'
import type { MobiConfig } from './mobi-types.js'
import { getStoreTypeForRecord } from './mobi-types.js'

const parser = new Parser()

// Lazy-loaded ESM modules
let wrapperModule: any = null
let CookieJarClass: any = null

// Initialize ESM modules using dynamic import
async function initEsmModules() {
  if (!wrapperModule) {
    // Use eval to prevent TypeScript from converting dynamic import to require
    const dynamicImport = new Function('specifier', 'return import(specifier)')

    const cookiejarSupport = await dynamicImport('axios-cookiejar-support')
    wrapperModule = cookiejarSupport.wrapper
    const toughCookie = await dynamicImport('tough-cookie')
    CookieJarClass = toughCookie.CookieJar
  }
}

// Cache for authenticated axios instances (to maintain session cookies)
const sessionCache = new Map<string, { client: AxiosInstance; jar: any; timestamp: number }>()
const SESSION_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

export class MobiProvider extends BaseProvider {
  readonly type = 'mobi' as const

  /**
   * Build SPARQL endpoint URL with record ID and optional branch parameters
   * Format: {baseUrl}/mobirest/sparql/{storeType}/{recordId}?branchId={branchId}&includeImports={bool}
   */
  protected buildEndpointUrl(config: BackendConfig): string {
    // Parse provider config
    let providerConfig: MobiConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      // If parsing fails, use base endpoint
      return `${config.endpoint}/mobirest/sparql`
    }

    // If no config, return base URL
    if (!providerConfig) {
      return `${config.endpoint}/mobirest/sparql`
    }

    // Handle repository-wide queries
    if (providerConfig.queryMode === 'repository') {
      if (!providerConfig.repositoryId) {
        return `${config.endpoint}/mobirest/sparql`
      }

      console.log('[MobiProvider] Building repository-wide endpoint URL:', {
        repositoryId: providerConfig.repositoryId,
        repositoryTitle: providerConfig.repositoryTitle,
      })

      // Build repository SPARQL endpoint
      // Format: /mobirest/sparql/repository/{encodedRepositoryIRI}
      let endpoint = `${config.endpoint}/mobirest/sparql/repository/${encodeURIComponent(providerConfig.repositoryId)}`

      // Add query parameters
      const params: string[] = []

      // Branch and includeImports can still be used with repository queries
      if (providerConfig.branchId) {
        params.push(`branchId=${encodeURIComponent(providerConfig.branchId)}`)
      }

      if (providerConfig.includeImports) {
        params.push('includeImports=true')
      }

      // Append query parameters if any
      if (params.length > 0) {
        endpoint += `?${params.join('&')}`
      }

      return endpoint
    }

    // Handle record-specific queries (default mode)
    if (!providerConfig.recordId) {
      return `${config.endpoint}/mobirest/sparql`
    }

    // Determine store type based on record type
    const storeType = providerConfig.storeType || getStoreTypeForRecord(providerConfig.recordType)

    console.log('[MobiProvider] Building record-specific endpoint URL:', {
      recordId: providerConfig.recordId,
      recordType: providerConfig.recordType,
      determinedStoreType: storeType,
      explicitStoreType: providerConfig.storeType,
    })

    // Build base SPARQL endpoint
    let endpoint = `${config.endpoint}/mobirest/sparql/${storeType}/${encodeURIComponent(providerConfig.recordId)}`

    // Add query parameters
    const params: string[] = []

    // Add branch parameter if specified (for flexible scoping)
    if (providerConfig.branchId) {
      params.push(`branchId=${encodeURIComponent(providerConfig.branchId)}`)
    }

    // Add includeImports parameter if enabled
    if (providerConfig.includeImports) {
      params.push('includeImports=true')
    }

    // Append query parameters if any
    if (params.length > 0) {
      endpoint += `?${params.join('&')}`
    }

    return endpoint
  }

  /**
   * Get or create authenticated axios client with session cookie support
   */
  private async getAuthenticatedClient(
    config: BackendConfig,
    credentials?: BackendCredentials,
    forceRefresh = false
  ): Promise<AxiosInstance> {
    // Initialize ESM modules if needed
    await initEsmModules()

    // Create cache key based on endpoint and username
    const cacheKey = `${config.endpoint}-${credentials?.username || 'anonymous'}`

    // Check cache if not forcing refresh
    if (!forceRefresh) {
      const cached = sessionCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL) {
        return cached.client
      }
    }

    // Create new axios instance with cookie jar support
    const jar = new CookieJarClass()

    // Note: axios-cookiejar-support doesn't support custom httpsAgent
    const axiosConfig: any = {
      timeout: 30000,
    }

    // Log warning if allowInsecure is enabled
    if (config.allowInsecure) {
      console.warn(
        '[Mobi] allowInsecure flag detected - SSL verification may not be disabled with cookie jar support'
      )
    }

    const client = wrapperModule(axios.create(axiosConfig))
    ;(client.defaults as { jar?: any }).jar = jar

    // Authenticate if credentials provided
    if (credentials?.username && credentials?.password) {
      try {
        await client.post(
          `${config.endpoint}/mobirest/session`,
          new URLSearchParams({
            username: credentials.username,
            password: credentials.password,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        )

        // Cache the authenticated client
        sessionCache.set(cacheKey, {
          client,
          jar,
          timestamp: Date.now(),
        })
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 401) {
            throw new Error('Authentication failed: Invalid username or password')
          }
          throw new Error(
            `Authentication failed: ${error.response?.data?.message || error.message}`
          )
        }
        throw error
      }
    }

    return client
  }

  /**
   * Execute SPARQL query against Mobi repository or record
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

    // Validate configuration
    let providerConfig: MobiConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      throw new Error('Invalid Mobi configuration')
    }

    if (!providerConfig) {
      throw new Error('No Mobi configuration found')
    }

    // Validate based on query mode
    if (providerConfig.queryMode === 'repository') {
      if (!providerConfig.repositoryId) {
        throw new Error(
          'No repository selected. Please select a repository in backend configuration.'
        )
      }
    } else {
      // Default to record mode
      if (!providerConfig.recordId) {
        throw new Error('No record selected. Please select a record in backend configuration.')
      }
    }

    try {
      // Build endpoint URL with record and branch parameters
      const endpoint = this.buildEndpointUrl(config)

      // Detect query type and set appropriate headers
      const queryType = this.detectQueryType(query)
      const acceptHeader = this.getAcceptHeader(queryType)
      const isRdfResponse = queryType === 'CONSTRUCT' || queryType === 'DESCRIBE'

      console.log('[MobiProvider] Executing SPARQL query:', {
        endpoint,
        queryType,
        acceptHeader,
        queryLength: query.length,
        queryPreview: query.substring(0, 200),
      })

      // Get authenticated client
      const client = await this.getAuthenticatedClient(config, credentials)

      // Execute query using SPARQL protocol
      const response = await client({
        method: 'POST',
        url: endpoint,
        headers: {
          'Content-Type': 'application/sparql-query',
          Accept: acceptHeader,
        },
        data: query,
        responseType: isRdfResponse ? 'text' : 'json',
      })

      console.log('[MobiProvider] Query executed successfully:', {
        statusCode: response.status,
        contentType: response.headers['content-type'],
        dataSize: JSON.stringify(response.data).length,
      })

      // Return structured response with metadata
      return {
        data: response.data,
        queryType,
        contentType: response.headers['content-type'] || 'unknown',
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status

        // Handle 401 - session expired, retry once with fresh auth
        if (statusCode === 401) {
          try {
            const client = await this.getAuthenticatedClient(config, credentials, true)
            const endpoint = this.buildEndpointUrl(config)
            const queryType = this.detectQueryType(query)
            const acceptHeader = this.getAcceptHeader(queryType)
            const isRdfResponse = queryType === 'CONSTRUCT' || queryType === 'DESCRIBE'

            const response = await client({
              method: 'POST',
              url: endpoint,
              headers: {
                'Content-Type': 'application/sparql-query',
                Accept: acceptHeader,
              },
              data: query,
              responseType: isRdfResponse ? 'text' : 'json',
            })

            return {
              data: response.data,
              queryType,
              contentType: response.headers['content-type'] || 'unknown',
            }
          } catch (retryError) {
            if (axios.isAxiosError(retryError)) {
              const message = retryError.response?.data?.message || retryError.message
              throw new Error(`SPARQL query failed after re-authentication: ${message}`)
            }
            throw new Error('SPARQL query failed after re-authentication')
          }
        }

        // Log detailed error information
        console.error('[MobiProvider] SPARQL query failed:', {
          statusCode,
          statusText: error.response?.statusText,
          responseData: error.response?.data,
          responseHeaders: error.response?.headers,
          requestUrl: error.config?.url,
          requestMethod: error.config?.method,
          requestHeaders: error.config?.headers,
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
   * Validate Mobi backend configuration (test connection)
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
    let providerConfig: MobiConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      return { valid: false, error: 'Invalid provider configuration' }
    }

    if (!providerConfig) {
      return { valid: false, error: 'No Mobi configuration found' }
    }

    // Validate based on query mode
    if (providerConfig.queryMode === 'repository') {
      if (!providerConfig.repositoryId) {
        return { valid: false, error: 'No repository selected' }
      }
    } else {
      // Default to record mode validation
      if (!providerConfig.recordId) {
        return { valid: false, error: 'No record selected' }
      }
    }

    // Build endpoint URL
    const endpoint = this.buildEndpointUrl(config)

    // Test connection with a simple SELECT query
    const testQuery = 'SELECT (COUNT(?s) as ?subjects) WHERE { ?s ?p ?o . } LIMIT 1'

    try {
      // Get authenticated client
      const client = await this.getAuthenticatedClient(config, credentials)

      const response = await client({
        method: 'POST',
        url: endpoint,
        headers: {
          'Content-Type': 'application/sparql-query',
          Accept: 'application/sparql-results+json, application/json',
        },
        data: testQuery,
        timeout: 10000, // 10 second timeout for validation
        responseType: 'json',
      })

      // Check if response is valid
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
      // Check if it's a Query (not an Update)
      if ('queryType' in parsed) {
        const type = parsed.queryType.toUpperCase()
        if (type === 'SELECT' || type === 'CONSTRUCT' || type === 'DESCRIBE' || type === 'ASK') {
          return type
        }
      }
      // If it's an Update or unknown, default to SELECT
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
        // Request Turtle (most readable and parseable RDF format)
        return 'text/turtle'
      default:
        return 'application/sparql-results+json, application/json'
    }
  }
}
