/**
 * Altair Graph Studio provider
 * Supports graphmart-based SPARQL queries with layer selection
 */

import axios from 'axios';
import { Parser } from 'sparqljs';
import { BaseProvider } from './BaseProvider.js';
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult } from '../types.js';
import type { GraphStudioConfig } from './graphstudio-types.js';

const parser = new Parser();

export class GraphStudioProvider extends BaseProvider {
  readonly type = 'graphstudio' as const;

  /**
   * Build SPARQL endpoint URL with graphmart and layer parameters
   * Format: {baseUrl}/sparql/graphmart/{encoded-graphmart-uri}?default-graph-uri={layer-uri}
   */
  protected buildEndpointUrl(config: BackendConfig): string {
    // Parse provider config
    let providerConfig: GraphStudioConfig | null = null;
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null;
    } catch {
      // If parsing fails, use base endpoint
      return config.endpoint;
    }

    // If no graphmart selected, return base URL
    if (!providerConfig || !providerConfig.graphmartUri) {
      return config.endpoint;
    }

    // Encode graphmart URI with uppercase hex (as per Cambridge Semantics docs)
    const encodedGraphmart = this.encodeGraphmartUri(providerConfig.graphmartUri);

    // Build base SPARQL endpoint
    let endpoint = `${config.endpoint}/sparql/graphmart/${encodedGraphmart}`;

    // Add layer parameters if specific layers selected
    if (
      providerConfig.selectedLayers &&
      Array.isArray(providerConfig.selectedLayers) &&
      providerConfig.selectedLayers.length > 0 &&
      !providerConfig.selectedLayers.includes('ALL_LAYERS')
    ) {
      const layerParams = providerConfig.selectedLayers
        .map(uri => `default-graph-uri=${encodeURIComponent(uri)}`)
        .join('&');
      endpoint += `?${layerParams}`;
    }

    return endpoint;
  }

  /**
   * Encode graphmart URI with uppercase hex digits (required by GraphStudio)
   */
  private encodeGraphmartUri(uri: string): string {
    return encodeURIComponent(uri).replace(/%[0-9a-f]{2}/gi, match => match.toUpperCase());
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
      throw new Error('Query too large (max 100KB)');
    }

    // Validate that graphmart is configured
    let providerConfig: GraphStudioConfig | null = null;
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null;
    } catch {
      throw new Error('Invalid GraphStudio configuration');
    }

    if (!providerConfig || !providerConfig.graphmartUri) {
      throw new Error('No graphmart selected. Please select a graphmart in backend configuration.');
    }

    try {
      // Build endpoint URL with graphmart and layers
      const endpoint = this.buildEndpointUrl(config);

      // Detect query type and set appropriate headers
      const queryType = this.detectQueryType(query);
      const acceptHeader = this.getAcceptHeader(queryType);
      const isRdfResponse = queryType === 'CONSTRUCT' || queryType === 'DESCRIBE';

      // Get authentication headers
      const authHeaders = this.getAuthHeaders(config, credentials);

      // Execute query using SPARQL protocol
      const response = await axios({
        method: 'POST',
        url: endpoint,
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': acceptHeader,
          ...authHeaders,
        },
        data: query,
        timeout: 30000, // 30 second timeout
        responseType: isRdfResponse ? 'text' : 'json',
        httpsAgent: this.createHttpsAgent(config),
      });

      // Return structured response with metadata
      return {
        data: response.data,
        queryType,
        contentType: response.headers['content-type'] || 'unknown',
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const message = error.response?.data?.message || error.message;

        throw new Error(
          `SPARQL query failed (${statusCode || 'network error'}): ${message}`
        );
      }

      if (error instanceof Error) {
        throw new Error(`Query execution failed: ${error.message}`);
      }

      throw new Error('Query execution failed: Unknown error');
    }
  }

  /**
   * Validate GraphStudio backend configuration (test connection)
   */
  async validate(config: BackendConfig, credentials?: BackendCredentials): Promise<ValidationResult> {
    // Validate URL format
    if (!this.validateUrl(config.endpoint)) {
      return { valid: false, error: 'Invalid endpoint URL' };
    }

    // Check if graphmart is configured
    let providerConfig: GraphStudioConfig | null = null;
    try {
      providerConfig = config.providerConfig ? JSON.parse(config.providerConfig) : null;
    } catch {
      return { valid: false, error: 'Invalid provider configuration' };
    }

    if (!providerConfig || !providerConfig.graphmartUri) {
      return { valid: false, error: 'No graphmart selected' };
    }

    // Build endpoint URL
    const endpoint = this.buildEndpointUrl(config);

    // Test connection with a simple ASK query
    const testQuery = 'SELECT (COUNT(?s) as ?subjects) WHERE { ?s ?p ?o . } LIMIT 1';

    try {
      // Get authentication headers
      const authHeaders = this.getAuthHeaders(config, credentials);

      const response = await axios({
        method: 'POST',
        url: endpoint,
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': 'application/sparql-results+json, application/json',
          ...authHeaders,
        },
        data: testQuery,
        timeout: 10000, // 10 second timeout for validation
        responseType: 'json',
        httpsAgent: this.createHttpsAgent(config),
      });

      // Check if response is valid
      if (response.status === 200) {
        return { valid: true };
      }

      return { valid: false, error: `Unexpected status code: ${response.status}` };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const message = error.response?.data?.message || error.message;
        return {
          valid: false,
          error: `Connection failed (${statusCode || 'network error'}): ${message}`,
        };
      }

      if (error instanceof Error) {
        return { valid: false, error: `Connection failed: ${error.message}` };
      }

      return { valid: false, error: 'Connection failed: Unknown error' };
    }
  }

  /**
   * Detect SPARQL query type
   */
  private detectQueryType(query: string): 'SELECT' | 'CONSTRUCT' | 'DESCRIBE' | 'ASK' {
    try {
      const parsed = parser.parse(query);
      // Check if it's a Query (not an Update)
      if ('queryType' in parsed) {
        const type = parsed.queryType.toUpperCase();
        if (type === 'SELECT' || type === 'CONSTRUCT' || type === 'DESCRIBE' || type === 'ASK') {
          return type;
        }
      }
      // If it's an Update or unknown, default to SELECT
      return 'SELECT';
    } catch {
      return 'SELECT';
    }
  }

  /**
   * Get appropriate Accept header based on query type
   */
  private getAcceptHeader(queryType: 'SELECT' | 'CONSTRUCT' | 'DESCRIBE' | 'ASK'): string {
    switch (queryType) {
      case 'SELECT':
      case 'ASK':
        return 'application/sparql-results+json, application/json';
      case 'CONSTRUCT':
      case 'DESCRIBE':
        // Request Turtle (most readable and parseable RDF format)
        return 'text/turtle';
      default:
        return 'application/sparql-results+json, application/json';
    }
  }
}

