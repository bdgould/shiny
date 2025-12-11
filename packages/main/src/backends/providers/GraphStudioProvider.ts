/**
 * Altair Graph Studio provider
 * Supports graphmart-based SPARQL queries with layer selection
 */

import axios from 'axios'
import { Parser } from 'sparqljs'
import { BaseProvider } from './BaseProvider.js'
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult } from '../types.js'
import type { GraphStudioConfig } from './graphstudio-types.js'

const parser = new Parser()

export class GraphStudioProvider extends BaseProvider {
  readonly type = 'graphstudio' as const

  /**
   * Build SPARQL endpoint URL with graphmart
   * Format: {baseUrl}/sparql/graphmart/{encoded-graphmart-uri}
   * Note: Layer filtering is now done via form body parameters, not query params
   */
  protected buildEndpointUrl(config: BackendConfig): string {
    // Parse provider config
    let providerConfig: GraphStudioConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      // If parsing fails, use base endpoint
      return config.endpoint
    }

    // If no graphmart selected, return base URL
    if (!providerConfig || !providerConfig.graphmartUri) {
      return config.endpoint
    }

    // Encode graphmart URI with uppercase hex (as per Cambridge Semantics docs)
    const encodedGraphmart = this.encodeGraphmartUri(providerConfig.graphmartUri)

    // Build base SPARQL endpoint (without layer query params)
    return `${config.endpoint}/sparql/graphmart/${encodedGraphmart}`
  }

  /**
   * Get selected layer URIs from config
   */
  private getSelectedLayers(config: BackendConfig): string[] | null {
    let providerConfig: GraphStudioConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      return null
    }

    // If no layers selected or "ALL_LAYERS" is selected, return null (query all layers)
    if (
      !providerConfig ||
      !providerConfig.selectedLayers ||
      !Array.isArray(providerConfig.selectedLayers) ||
      providerConfig.selectedLayers.length === 0 ||
      providerConfig.selectedLayers.includes('ALL_LAYERS')
    ) {
      return null
    }

    return providerConfig.selectedLayers
  }

  /**
   * Encode graphmart URI with uppercase hex digits (required by GraphStudio)
   */
  private encodeGraphmartUri(uri: string): string {
    return encodeURIComponent(uri).replace(/%[0-9a-f]{2}/gi, (match) => match.toUpperCase())
  }

  /**
   * Execute SPARQL query against GraphStudio graphmart
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

    // Validate that graphmart is configured
    let providerConfig: GraphStudioConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      throw new Error('Invalid GraphStudio configuration')
    }

    if (!providerConfig || !providerConfig.graphmartUri) {
      throw new Error('No graphmart selected. Please select a graphmart in backend configuration.')
    }

    try {
      // Build endpoint URL with graphmart and layers
      const endpoint = this.buildEndpointUrl(config)

      // Detect query type and set appropriate headers
      const queryType = this.detectQueryType(query)
      const acceptHeader = this.getAcceptHeader(queryType)
      const isRdfResponse = queryType === 'CONSTRUCT' || queryType === 'DESCRIBE'

      // Get authentication headers
      const authHeaders = this.getAuthHeaders(config, credentials)

      // Get selected layers for filtering
      const selectedLayers = this.getSelectedLayers(config)

      console.log('[GraphStudio Query] Endpoint:', endpoint)
      console.log('[GraphStudio Query] Query type:', queryType)
      console.log('[GraphStudio Query] Selected layers:', selectedLayers)

      // Execute query using SPARQL protocol
      // If layers are selected, use form-encoded body with default-graph-uri parameter(s)
      // Otherwise, use application/sparql-query content type
      let response
      if (selectedLayers && selectedLayers.length > 0) {
        // Use form-encoded format with layer filtering
        const formData = new URLSearchParams()
        formData.append('query', query)
        // Add each layer URI as a separate default-graph-uri parameter
        selectedLayers.forEach((layerUri) => {
          formData.append('default-graph-uri', layerUri)
        })

        const requestBody = formData.toString()
        console.log('[GraphStudio Query] Using form-encoded request')
        console.log('[GraphStudio Query] Request headers:', {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: acceptHeader,
        })
        console.log('[GraphStudio Query] Request body:', requestBody)

        response = await axios({
          method: 'POST',
          url: endpoint,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: acceptHeader,
            ...authHeaders,
          },
          data: requestBody,
          timeout: 30000, // 30 second timeout
          responseType: isRdfResponse ? 'text' : 'json',
          httpsAgent: this.createHttpsAgent(config),
        })
      } else {
        // No layer filtering - query all layers
        console.log('[GraphStudio Query] Using direct SPARQL request')
        console.log('[GraphStudio Query] Request headers:', {
          'Content-Type': 'application/sparql-query',
          Accept: acceptHeader,
        })
        console.log('[GraphStudio Query] Query:', query.substring(0, 200) + '...')

        response = await axios({
          method: 'POST',
          url: endpoint,
          headers: {
            'Content-Type': 'application/sparql-query',
            Accept: acceptHeader,
            ...authHeaders,
          },
          data: query,
          timeout: 30000, // 30 second timeout
          responseType: isRdfResponse ? 'text' : 'json',
          httpsAgent: this.createHttpsAgent(config),
        })
      }

      console.log('[GraphStudio Query] Response status:', response.status)
      console.log('[GraphStudio Query] Response headers:', response.headers)

      // Return structured response with metadata
      return {
        data: response.data,
        queryType,
        contentType: response.headers['content-type'] || 'unknown',
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        const responseData = error.response?.data
        const message = error.response?.data?.message || error.message

        // Log detailed error information
        console.error('[GraphStudio Query] Request failed')
        console.error('[GraphStudio Query] Status:', statusCode)
        console.error('[GraphStudio Query] Response headers:', error.response?.headers)
        console.error('[GraphStudio Query] Response data:', responseData)
        console.error('[GraphStudio Query] Error message:', message)
        console.error('[GraphStudio Query] Request config:', {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
          data: error.config?.data?.substring?.(0, 500) || error.config?.data,
        })

        // Build detailed error message
        let errorMsg = `SPARQL query failed (${statusCode || 'network error'}): ${message}`

        // Add response body if available and different from message
        if (responseData && typeof responseData === 'string' && responseData !== message) {
          errorMsg += `\n\nServer response: ${responseData.substring(0, 500)}`
        } else if (responseData && typeof responseData === 'object') {
          errorMsg += `\n\nServer response: ${JSON.stringify(responseData, null, 2).substring(0, 500)}`
        }

        throw new Error(errorMsg)
      }

      if (error instanceof Error) {
        console.error('[GraphStudio Query] Error:', error)
        throw new Error(`Query execution failed: ${error.message}`)
      }

      console.error('[GraphStudio Query] Unknown error:', error)
      throw new Error('Query execution failed: Unknown error')
    }
  }

  /**
   * Validate GraphStudio backend configuration (test connection)
   */
  async validate(
    config: BackendConfig,
    credentials?: BackendCredentials
  ): Promise<ValidationResult> {
    // Validate URL format
    if (!this.validateUrl(config.endpoint)) {
      return { valid: false, error: 'Invalid endpoint URL' }
    }

    // Check if graphmart is configured
    let providerConfig: GraphStudioConfig | null = null
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null
    } catch {
      return { valid: false, error: 'Invalid provider configuration' }
    }

    if (!providerConfig || !providerConfig.graphmartUri) {
      return { valid: false, error: 'No graphmart selected' }
    }

    // Build endpoint URL
    const endpoint = this.buildEndpointUrl(config)

    // Test connection with a simple ASK query
    const testQuery = 'SELECT (COUNT(?s) as ?subjects) WHERE { ?s ?p ?o . } LIMIT 1'

    try {
      // Get authentication headers
      const authHeaders = this.getAuthHeaders(config, credentials)

      const response = await axios({
        method: 'POST',
        url: endpoint,
        headers: {
          'Content-Type': 'application/sparql-query',
          Accept: 'application/sparql-results+json, application/json',
          ...authHeaders,
        },
        data: testQuery,
        timeout: 10000, // 10 second timeout for validation
        responseType: 'json',
        httpsAgent: this.createHttpsAgent(config),
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
