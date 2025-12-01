/**
 * Generic SPARQL 1.1 provider
 * Supports standard SPARQL protocol with multiple authentication methods
 */

import axios from 'axios';
import { Parser } from 'sparqljs';
import { BaseProvider } from './BaseProvider.js';
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult } from '../types.js';

const parser = new Parser();

export class Sparql11Provider extends BaseProvider {
  readonly type = 'sparql-1.1' as const;

  /**
   * Execute SPARQL query
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

    try {
      // Detect query type and set appropriate headers
      const queryType = this.detectQueryType(query);
      const acceptHeader = this.getAcceptHeader(queryType);
      const isRdfResponse = queryType === 'CONSTRUCT' || queryType === 'DESCRIBE';

      // Get authentication headers
      const authHeaders = this.getAuthHeaders(config, credentials);

      // Execute query using SPARQL protocol
      const response = await axios({
        method: 'POST',
        url: config.endpoint,
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': acceptHeader,
          ...authHeaders,
        },
        data: query,
        timeout: 30000, // 30 second timeout
        // For RDF responses, get as text; for JSON responses, parse automatically
        responseType: isRdfResponse ? 'text' : 'json',
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
   * Validate backend configuration (test connection)
   */
  async validate(config: BackendConfig): Promise<ValidationResult> {
    // Validate URL format
    if (!this.validateUrl(config.endpoint)) {
      return { valid: false, error: 'Invalid endpoint URL' };
    }

    // Test connection with a simple ASK query
    const testQuery = 'ASK { ?s ?p ?o }';

    try {
      const response = await axios({
        method: 'POST',
        url: config.endpoint,
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': 'application/sparql-results+json',
        },
        data: testQuery,
        timeout: 10000, // 10 second timeout for validation
        responseType: 'json',
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
        return 'application/sparql-results+json';
      case 'CONSTRUCT':
      case 'DESCRIBE':
        // Request Turtle (most readable and parseable RDF format)
        return 'text/turtle';
      default:
        return 'application/sparql-results+json';
    }
  }
}
