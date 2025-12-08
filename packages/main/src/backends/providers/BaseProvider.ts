/**
 * Base provider abstract class
 * All backend providers must extend this class
 */

import https from 'https';
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult, BackendType } from '../types.js';

export abstract class BaseProvider {
  abstract readonly type: BackendType;

  /**
   * Execute a SPARQL query against the backend
   */
  abstract execute(
    config: BackendConfig,
    query: string,
    credentials?: BackendCredentials
  ): Promise<QueryResult>;

  /**
   * Validate backend configuration (test connection)
   */
  abstract validate(config: BackendConfig, credentials?: BackendCredentials): Promise<ValidationResult>;

  /**
   * Build the final endpoint URL for query execution
   * Providers can override this to construct custom URLs based on provider-specific config
   * @param config - Backend configuration
   * @returns Final endpoint URL to use for SPARQL queries
   */
  protected buildEndpointUrl(config: BackendConfig): string {
    // Default implementation: return endpoint as-is
    return config.endpoint;
  }

  /**
   * Get authentication headers based on auth type and credentials
   */
  protected getAuthHeaders(
    config: BackendConfig,
    credentials?: BackendCredentials
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    if (!credentials || config.authType === 'none') {
      return headers;
    }

    switch (config.authType) {
      case 'basic':
        if (credentials.username && credentials.password) {
          const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
          console.warn('Using Basic authentication for SPARQL endpoint');
        }
        break;

      case 'bearer':
        if (credentials.token) {
          headers['Authorization'] = `Bearer ${credentials.token}`;
        }
        break;

      case 'custom':
        if (credentials.headers) {
          Object.assign(headers, credentials.headers);
        }
        break;
    }

    return headers;
  }

  /**
   * Validate URL format
   */
  protected validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Create HTTPS agent with SSL certificate handling
   * If allowInsecure is true, bypasses certificate validation (for self-signed certs)
   */
  protected createHttpsAgent(config: BackendConfig): https.Agent | undefined {
    // Only create agent for HTTPS URLs
    if (!config.endpoint.startsWith('https:')) {
      return undefined;
    }

    return new https.Agent({
      rejectUnauthorized: !config.allowInsecure,
    });
  }
}
